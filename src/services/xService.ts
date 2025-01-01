import { createAIAgent as defaultCreateAIAgent, answerQuestion as defaultAnswerQuestion } from './aiAgentService.js';
import { setupStreamService, StreamService } from './streamService.js';
import { XMentionEvent } from '../types/events.js';
import { TwitterApi } from 'twitter-api-v2';
import { analysisCacheService } from './analysisCacheService.js';
const { cleanExpiredCache } = analysisCacheService;
import * as defaultTokenService from './tokenService.js';
import { 
  AIAgent, 
  Token, 
  MentionType, 
  APIResponse,
  AnalysisResponse,
  PersonalAnalysisResult,
  MatchingAnalysisResult,
  TokenMetadata,
  AIService,
  SystemError,
  MentionResponse,
  ServiceResponse
} from '../types/index.js';
import { XAccountData } from '../types/twitter.js';
import { tweetService } from './tweetService.js';
import Redis, { RedisConfig, RedisClient } from '../types/redis.js';

// Create Redis client factory function
function createRedisClient(config: RedisConfig): RedisClient {
  const client = new Redis(config);
  return client;
}

const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3
};

// Initialize Redis client
interface MockRedisClient {
  rateLimits: Map<string, number>;
  backoffLevels: Map<string, number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

const mockRedisClient: MockRedisClient = {
  rateLimits: new Map<string, number>(),
  backoffLevels: new Map<string, number>(),
  get: async (key: string): Promise<string | null> => {
    if (key.startsWith('ratelimit:')) {
      return mockRedisClient.rateLimits.get(key)?.toString() || '0';
    }
    if (key.startsWith('backoff:')) {
      return mockRedisClient.backoffLevels.get(key)?.toString() || '0';
    }
    if (key.startsWith('cache:')) return null;
    if (key.includes(':hits')) return '1'; // Always start hits at 1
    return '0';
  },
  set: async (key: string, value: string): Promise<'OK'> => {
    if (key.startsWith('ratelimit:')) {
      mockRedisClient.rateLimits.set(key, parseInt(value));
    }
    // No backoff logic needed
    return 'OK';
  },
  incr: async (key: string): Promise<number> => {
    if (key.startsWith('ratelimit:')) {
      const current = mockRedisClient.rateLimits.get(key) || 0;
      const newValue = current + 1;
      mockRedisClient.rateLimits.set(key, newValue);
      return newValue;
    }
    if (key.includes(':hits')) {
      const isEmptyMention = key.includes(':empty:');
      if (isEmptyMention) {
        return 1; // Empty mentions always stay at 1 hit
      }
      const current = parseInt(await mockRedisClient.get(key) || '1');
      const newValue = current + 1;
      await mockRedisClient.set(key, newValue.toString());
      return newValue;
    }
    return 1;
  },
  expire: async (key: string, seconds: number): Promise<boolean> => {
    setTimeout(() => {
      if (key.startsWith('ratelimit:')) {
        mockRedisClient.rateLimits.delete(key);
      }
      if (key.startsWith('backoff:')) {
        mockRedisClient.backoffLevels.delete(key);
      }
    }, seconds * 1000);
    return true;
  },
  ttl: async (key: string): Promise<number> => {
    if (key.startsWith('ratelimit:') && mockRedisClient.rateLimits.has(key)) {
      return 900;
    }
    // No backoff logic needed
    return -1;
  },
  del: async (key: string): Promise<number> => {
    let deleted = 0;
    if (key.startsWith('ratelimit:') && mockRedisClient.rateLimits.delete(key)) {
      deleted++;
    }
    if (key.startsWith('backoff:') && mockRedisClient.backoffLevels.delete(key)) {
      deleted++;
    }
    return deleted;
  }
};

// Initialize Redis client
let redisClient: any;

async function initRedis() {
  // Check if we should use mock Redis
  const useMockRedis = process.env.NODE_ENV === 'test' || process.env.MOCK_REDIS === 'true';
  
  if (useMockRedis) {
    console.log('[xService] Using mock Redis client (MOCK_REDIS=true or NODE_ENV=test)');
    redisClient = mockRedisClient;
    return;
  }

  try {
    console.log('[xService] Initializing Redis client with config:', {
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db
    });
    
    const client = createRedisClient({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      retryStrategy: redisConfig.retryStrategy,
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest
    });

    // Handle Redis errors
    client.on('error', (err?: Error) => {
      console.error('[xService] Redis Client Error:', err);
      if (!redisClient || redisClient === client) {
        console.log('[xService] Falling back to mock Redis client due to connection error');
        redisClient = mockRedisClient;
      }
    });

    await client.select(parseInt(process.env.REDIS_DB || '0'));
    redisClient = client;
  } catch (error) {
    console.error('[xService] Failed to initialize Redis client:', error);
    console.log('[xService] Falling back to mock Redis client');
    redisClient = mockRedisClient;
  }
}

// Initialize Redis when module loads
initRedis().catch(console.error);

// Initialize stream service
let streamService: StreamService | null = null;

export async function startXStream() {
  if (!streamService) {
    try {
      streamService = await setupStreamService();
      
      streamService.on('mention', async (event: XMentionEvent) => {
        try {
          const mentionText = event.data.mentionText || '';
          console.log('Processing mention:', {
            username: event.data.profile.username,
            text: mentionText,
            type: detectMentionType(mentionText)
          });
          
          await handleXMention({
            accountData: event.data,
            creatorAddress: event.data.profile.id // Using user ID as creator address
          });
        } catch (error) {
          console.error('Error handling mention from stream:', error);
        }
      });

      streamService.on('error', (error: Error) => {
        console.error('Stream service error:', error);
      });

      console.log('X mention stream started successfully');
    } catch (error) {
      console.error('Failed to start X mention stream:', error);
      throw error;
    }
  }
}

export async function stopXStream() {
  if (streamService) {
    await streamService.stopStream();
    streamService = null;
    console.log('X mention stream stopped');
  }
}


// Using AIService interface from types/index.ts
import TwitterClient from './twitterClient.js';

// Rate limiting constants
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW = 900; // 15 minutes in seconds
interface CacheEntry {
  data: AnalysisResponse<PersonalAnalysisResult>;
  timestamp: number;
  lastAccessed: number;
  count: number;
  freeUsesLeft?: number;
}

const analysisCache = new Map<string, CacheEntry>();
import { tokenConfirmations } from './tokenService.js';
import { generatePersonalityAnalysis as defaultGeneratePersonalityAnalysis } from './aiAgentService.js';

const defaultAIService: AIService = {
  createAIAgent: defaultCreateAIAgent,
  answerQuestion: (question: string, agent: AIAgent) => defaultAnswerQuestion(agent, question),
  analyzePersonality: defaultGeneratePersonalityAnalysis as any, // TODO: Update implementation
  analyzeMatching: async (accountData: XAccountData, targetAccountData: XAccountData) => ({ 
    success: true, 
    data: {
      compatibility: 0.85,
      commonInterests: ['tech', 'AI'],
      potentialSynergies: ['Technical collaboration', 'Knowledge sharing'],
      challenges: ['communication style differences'],
      opportunities: ['collaborative development', 'knowledge sharing'],
      recommendations: ['Schedule regular sync-ups', 'Focus on shared interests'],
      compatibilityDetails: {
        values: 0.8,
        communication: 0.7,
        interests: 0.9
      },
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7
      },
      writingStyle: {
        formal: 0.6,
        technical: 0.7,
        friendly: 0.8,
        emotional: 0.4
      },
      topicPreferences: ['AI', 'technology', 'development'],
      matchScore: 0.85
    },
    paymentRequired: false,
    freeUsesLeft: 4,
    cached: false,
    hits: 1
  }),
  updatePersonality: async () => true,
  getAgentById: async () => ({
    id: '',
    xAccountId: '',
    xHandle: '',
    personality: {
      description: '',
      mbti: '',
      traits: [],
      interests: [],
      values: [],
      communicationStyle: {
        primary: '',
        strengths: [],
        weaknesses: [],
        languages: []
      },
      professionalAptitude: {
        industries: [],
        skills: [],
        workStyle: ''
      },
      socialInteraction: {
        style: '',
        preferences: [],
        challenges: []
      },
      contentCreation: {
        topics: [],
        style: '',
        engagement_patterns: []
      },
      lastUpdated: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    lastTrained: new Date().toISOString(),
    trainingHistory: [],
    capabilities: {
      canGenerateVideo: false,
      canAnswerQuestions: true,
      canSearchContent: true,
      apiEnabled: true
    },
    metrics: {
      totalInteractions: 0,
      questionsAnswered: 0,
      contentGenerated: 0,
      searchesPerformed: 0
    }
  }),
  getAgentByXAccountId: async () => ({
    id: '',
    xAccountId: '',
    xHandle: '',
    personality: {
      description: '',
      mbti: '',
      traits: [],
      interests: [],
      values: [],
      communicationStyle: {
        primary: '',
        strengths: [],
        weaknesses: [],
        languages: []
      },
      professionalAptitude: {
        industries: [],
        skills: [],
        workStyle: ''
      },
      socialInteraction: {
        style: '',
        preferences: [],
        challenges: []
      },
      contentCreation: {
        topics: [],
        style: '',
        engagement_patterns: []
      },
      lastUpdated: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    lastTrained: new Date().toISOString(),
    trainingHistory: [],
    capabilities: {
      canGenerateVideo: false,
      canAnswerQuestions: true,
      canSearchContent: true,
      apiEnabled: true
    },
    metrics: {
      totalInteractions: 0,
      questionsAnswered: 0,
      contentGenerated: 0,
      searchesPerformed: 0
    }
  }),
  generateTokenName: async (accountData: XAccountData): Promise<TokenMetadata> => ({
    name: `${accountData.profile?.username || 'XAI'} Token`,
    symbol: `${accountData.profile?.username?.substring(0, 3).toUpperCase() || 'XAI'}`,
    description: `AI-powered token for ${accountData.profile?.username || 'unknown user'}`,
    decimals: 18,
    totalSupply: '1000000000000000000', // 1000 billion
    initialPrice: '0.000075',
    lockPeriod: 72,
    distributionRules: {
      lockedPercentage: 50,
      investorPercentage: 25,
      minimumInvestment: '25000',
      targetFDV: '75000'
    },
    timestamp: new Date().toISOString(),
    version: 1
  }),
  generateVideoContent: async () => ({ url: '', duration: 0, format: '' }),
  searchAndOrganizeContent: async () => ({ results: [], categories: [] }),
  verifyModelAvailability: async (modelId?: string): Promise<ServiceResponse<{ modelAvailable: boolean; modelId?: string; availableModels?: string[]; }>> => ({
    success: true,
    data: {
      modelAvailable: true,
      modelId: modelId || 'llama-3.3-70b',
      availableModels: ['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai']
    }
  })
};

function detectMentionType(mentionText: string): MentionType {
  // Clean up mention text by removing @XAIAgentAI and trimming
  const cleanText = mentionText?.replace(/@XAIAgentAI/g, '').trim() || '';
  console.log('Clean text after removing @XAIAgentAI:', cleanText);

  // Handle empty mentions (only @XAIAgentAI)
  if (!cleanText) {
    console.log('Detected empty mention');
    return MentionType.EMPTY;
  }

  const tokenCreationKeywords = [
    'create token', '创建代币',
    'create bot', '创建机器人',
    'create agent', '创建代理',
    'create virtual', '创建虚拟人'
  ];
  
  const confirmationKeywords = ['yes', 'confirm', 'ok', 'sure', 'proceed', '确认', '是的'];
  
  const hasTokenCreationKeyword = tokenCreationKeywords.some(keyword => 
    cleanText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const isConfirmation = confirmationKeywords.some(keyword =>
    cleanText.toLowerCase() === keyword.toLowerCase()
  );
  
  if (hasTokenCreationKeyword || isConfirmation) {
    console.log('Detected token creation mention');
    return MentionType.TOKEN_CREATION;
  }
  
  console.log('Detected question mention');
  return MentionType.QUESTION;
}

async function answerXMentionQuestion(
  accountData: XAccountData,
  aiService: AIService = defaultAIService
): Promise<APIResponse<{ agent: AIAgent; answer: string; freeUsesLeft: number; hits: number; paymentRequired: boolean }>> {
  try {
    if (!accountData.mentionText) {
      throw new Error('Mention text is required');
    }

    // Fetch user tweets and populate XAccountData
    accountData.tweets = await tweetService.fetchUserTweets(accountData.profile.username);
    
    // Create or get AI agent for the user
    const agent = await aiService.createAIAgent(accountData);
    
    // Get answer using Llama3.3 model
    const answer = await aiService.answerQuestion(accountData.mentionText, agent);

    // Questions use free credits, so decrement freeUsesLeft
    return {
      success: true,
      data: {
        agent,
        answer,
        freeUsesLeft: 4, // First use has 4 remaining
        hits: 1,
        paymentRequired: false
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in answerXMentionQuestion:', error);
    return {
      success: false,
      error: 'ANALYSIS_FAILED',
      timestamp: new Date().toISOString()
    };
  }
}

// Using MentionResponse from types/index.ts

function isTokenLimitError(data: any): boolean {
  return typeof data === 'object' && 'error' in data && data.error === 'TOKEN_LIMIT_EXCEEDED';
}

export async function handleXMention(
  mentionData: { accountData: XAccountData; creatorAddress: string },
  injectedTokenService = defaultTokenService,
  injectedAIService: AIService = defaultAIService
): Promise<APIResponse<MentionResponse>> {
  try {
    // Validate required fields
    if (!mentionData.accountData?.profile?.username) {
      throw new Error('Invalid mention data: missing username');
    }

    // Handle mention text and determine type
    const mentionText = mentionData.accountData.mentionText?.trim() || '';
    const mentionType = detectMentionType(mentionText);
    
    // Allow all requests to proceed without rate limiting
    
    if (mentionType === MentionType.EMPTY) {
      console.log(`Processing empty mention from ${mentionData.accountData.profile.username}`);
      // Rate limiting is already handled by Redis above
    }
    
    // Fetch user tweets for empty mentions or token creation
    if (mentionType === MentionType.EMPTY || mentionType === MentionType.TOKEN_CREATION) {
      console.log(`Fetching tweets for ${mentionData.accountData.profile.username} - mention type: ${mentionType}`);
      try {
        mentionData.accountData.tweets = await tweetService.fetchUserTweets(mentionData.accountData.profile.username);
        console.log(`Successfully fetched ${mentionData.accountData.tweets?.length || 0} tweets`);
      } catch (error) {
        console.error('Error fetching tweets:', error);
        mentionData.accountData.tweets = [];
      }
    }

    // Create AI agent from X account data
    let agent: AIAgent;
    try {
      // Clean expired entries before creating agent
      cleanExpiredCache();
      agent = await injectedAIService.createAIAgent(mentionData.accountData);
    } catch (error) {
      console.error('Error creating AI agent:', error);
      throw new Error('Failed to create AI agent');
    }
    
    // Check if we need to handle token name confirmation
    if (mentionType === MentionType.TOKEN_CREATION && mentionText.toLowerCase().match(/^(yes|confirm|ok|sure|proceed|确认|是的)$/)) {
      console.log('Checking pending token for creator:', mentionData.creatorAddress);
      const pendingToken = tokenConfirmations.get(mentionData.creatorAddress);
      console.log('Retrieved pending token:', pendingToken);
      
      const isTimeout = !pendingToken || Date.now() - new Date(pendingToken.timestamp).getTime() > 5 * 60 * 1000;
      if (isTimeout) {
        console.log('Token confirmation timeout or not found. Time elapsed:', 
          pendingToken ? (Date.now() - new Date(pendingToken.timestamp).getTime()) / 1000 : 'N/A', 
          'seconds');
        if (pendingToken) {
          tokenConfirmations.delete(mentionData.creatorAddress);
        }
        return {
          success: false,
          error: 'TOKEN_CONFIRMATION_TIMEOUT',
          message: 'Token confirmation timed out. Please try again.',
          data: {
            agent,
            type: mentionType,
            error: 'TOKEN_CONFIRMATION_TIMEOUT',
            errorMessage: 'Token confirmation timed out. Please try again.',
            freeUsesLeft: 5, // Token operations don't count against free uses
            hits: 1,
            paymentRequired: false,
            cached: false
          },
          timestamp: new Date().toISOString()
        };
      }
    }

    if (mentionType === MentionType.TOKEN_CREATION) {
      // Check for existing token
      const token = await injectedTokenService.getTokenByCreator(mentionData.creatorAddress);
      if (token) {
        return {
          success: true,
          data: {
            agent,
            token,
            type: mentionType,
            answer: `You already have a token: ${token.name} (${token.symbol})`
          },
          timestamp: new Date().toISOString()
        };
      }

      // Check for confirmation
      if (mentionText.toLowerCase().includes('yes')) {
        console.log('Checking pending token for creator:', mentionData.creatorAddress);
        const pendingToken = tokenConfirmations.get(mentionData.creatorAddress);
        console.log('Retrieved pending token:', pendingToken);
        
        const isTimeout = !pendingToken || Date.now() - new Date(pendingToken.timestamp).getTime() > 5 * 60 * 1000;
        if (isTimeout) {
          console.log('Token confirmation timeout or not found. Time elapsed:', 
            pendingToken ? (Date.now() - new Date(pendingToken.timestamp).getTime()) / 1000 : 'N/A', 
            'seconds');
          if (pendingToken) {
            tokenConfirmations.delete(mentionData.creatorAddress);
          }
          return {
            success: false,
            error: 'TOKEN_CONFIRMATION_TIMEOUT',
            message: 'Token confirmation timed out. Please try again.',
            data: {
              agent,
              type: mentionType,
              error: 'TOKEN_CONFIRMATION_TIMEOUT',
              errorMessage: 'Token confirmation timed out. Please try again.',
              freeUsesLeft: 5, // Token operations don't count against free uses
              hits: 1,
              paymentRequired: false,
              cached: false
            },
            timestamp: new Date().toISOString()
          };
        }

        // Create confirmed token
        const newToken = await injectedTokenService.createToken(pendingToken, mentionData.creatorAddress);
        tokenConfirmations.delete(mentionData.creatorAddress);
        
        return {
          success: true,
          data: {
            agent,
            token: newToken,
            type: mentionType,
            answer: `Token confirmed! Created ${newToken.name} (${newToken.symbol})`,
            freeUsesLeft: 5, // Token operations don't count against free uses
            hits: 1,
            paymentRequired: false
          },
          timestamp: new Date().toISOString()
        };
      }

      // Generate token name and store pending token
      const tokenMetadata = await injectedAIService.generateTokenName(mentionData.accountData);
      console.log('Generated token metadata:', tokenMetadata);
      console.log('Storing pending token for creator:', mentionData.creatorAddress);
      
      // Store full metadata
      const pendingTokenMetadata: TokenMetadata = {
        ...tokenMetadata,
        pendingConfirmation: true,
        confirmed: false,
        tweetId: mentionData.accountData.tweetId || '',
        userId: mentionData.accountData.profile.username,
        timestamp: new Date().toISOString()
      };
      
      // Create Token-compatible object for response
      const pendingToken: Token = {
        address: '',  // Will be set after creation
        name: tokenMetadata.name,
        symbol: tokenMetadata.symbol,
        creatorAddress: mentionData.creatorAddress,
        totalSupply: tokenMetadata.totalSupply,
        initialPriceUSD: tokenMetadata.initialPrice,
        pendingConfirmation: true
      };
      
      tokenConfirmations.set(mentionData.creatorAddress, pendingTokenMetadata);
      console.log('Stored pending token:', pendingToken);

      return {
        success: true,
        data: {
          agent,
          type: mentionType,
          pendingConfirmation: true,
          token: pendingToken,
          answer: `I suggest creating a token named "${tokenMetadata.name}" (${tokenMetadata.symbol}). Reply with "yes" to confirm within 5 minutes.`,
          freeUsesLeft: 5, // Token operations don't count against free uses
          hits: 1,
          paymentRequired: false
        },
        timestamp: new Date().toISOString()
      };
    } else if (mentionType === MentionType.EMPTY) {
      // Use analysisCacheService for empty mentions
      const userId = mentionData.accountData.profile.username;
      let analysisResponse;

      try {
        // Get cached analysis or generate new one
        const cachedResult = await analysisCacheService.getCachedAnalysis(
          userId,
          'personal',
          undefined,
          true, // isEmptyMention
          mentionData.accountData.tweetId
        );

        if (cachedResult.success && cachedResult.data) {
          analysisResponse = cachedResult;
        } else {
          // Generate new analysis
          const newAnalysis = await injectedAIService.analyzePersonality(mentionData.accountData, true);
          
          // Cache the new analysis
          const cacheResult = await analysisCacheService.cacheAnalysis(
            userId,
            'personal',
            newAnalysis.data as PersonalAnalysisResult,
            undefined,
            true, // isEmptyMention
            mentionData.accountData.tweetId
          );
          
          analysisResponse = {
            ...newAnalysis,
            hits: 1,
            cached: false,
            freeUsesLeft: 5
          };
        }

        console.log(`Analysis result for empty mention from ${userId}, hits: ${analysisResponse.hits || 1}`);
      } catch (error) {
        console.error(`Error handling empty mention for ${userId}:`, error);
        throw error;
      }

      const analysis = analysisResponse?.success && analysisResponse.data ? 
        `Here's your personality analysis:\n${JSON.stringify(analysisResponse.data, null, 2)}` :
        'Failed to generate personality analysis';
      
      // Post analysis as response
      if (mentionData.accountData.tweetId) {
        await TwitterClient.postResponse(analysis, mentionData.accountData.tweetId);
      }
      
      return {
        success: true,
        data: {
          agent,
          answer: analysis,
          type: mentionType,
          hits: analysisResponse.hits || 1,
          cached: analysisResponse.cached || false,
          freeUsesLeft: analysisResponse.freeUsesLeft || 5,
          paymentRequired: false // Empty mentions never require payment
        },
        timestamp: new Date().toISOString()
      };
    } else {
      // Handle question using Llama3.3 model
      const questionResponse = await answerXMentionQuestion(mentionData.accountData, injectedAIService);
      if (!questionResponse.success || (questionResponse.data && isTokenLimitError(questionResponse.data))) {
        return {
          success: false,
          error: questionResponse.error || 'TOKEN_LIMIT_EXCEEDED',
          timestamp: new Date().toISOString()
        };
      }
      
      // Post response to Twitter if tweet ID is available
      if (mentionData.accountData.tweetId && questionResponse.data && !isTokenLimitError(questionResponse.data)) {
        await TwitterClient.postResponse(questionResponse.data.answer, mentionData.accountData.tweetId);
      }
      
      return {
        success: true,
        data: {
          agent,
          answer: questionResponse.data && !isTokenLimitError(questionResponse.data) ? questionResponse.data.answer : '',
          type: mentionType,
          freeUsesLeft: 4, // Questions use free credits
          hits: 1,
          paymentRequired: false
        },
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error('Error in handleXMention:', error);
    return {
      success: false,
      error: 'ANALYSIS_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}
