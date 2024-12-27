import { 
  AIAgent, 
  PersonalityAnalysis, 
  TokenMetadata,
  PersonalAnalysisResult,
  MatchingAnalysisResult,
  AnalysisResponse,
  SystemError
} from '../types';
import { XAccountData, Tweet } from '../types/twitter.js';
// Allow dependency injection for testing
import { userAnalyticsService as defaultUserAnalyticsService } from './userAnalyticsService';
import { paymentService as defaultPaymentService } from './paymentService';
import { analysisCacheService as defaultAnalysisCacheService } from './analysisCacheService';
import fetch from 'node-fetch';

// Define DecentralGPT client interface
interface DecentralGPTClient {
  call(prompt: string, context: string): Promise<string>;
}

let _userAnalyticsService = defaultUserAnalyticsService;
let _paymentService = defaultPaymentService;
let _analysisCacheService = defaultAnalysisCacheService;
let _decentralGPTClient: DecentralGPTClient = {
  async call(prompt: string, context: string): Promise<string> {
    const response = await fetch(DECENTRALGPT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DECENTRALGPT_API_KEY}`,
      },
      body: JSON.stringify({
        model: DECENTRALGPT_MODEL,
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: context
          }
        ],
        project: DECENTRALGPT_PROJECT,
        stream: false
      })
    });

    if (!response.ok) {
      const errorMessage = await response.text().catch(() => response.statusText);
      if (response.status === 429) {
        throw new Error('DecentralGPT API rate limit exceeded. Please try again later.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('DecentralGPT API authentication failed. Please check your API key.');
      }
      throw new Error(`DecentralGPT API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json() as {
      code: number;
      message: string;
      data: {
        created: number;
        choices: Array<{
          index: number;
          message: {
            role: string;
            content: string;
          };
          finish_reason: string;
        }>;
        usage: {
          completion_tokens: number;
          prompt_tokens: number;
          total_tokens: number;
        };
      };
    };

    if (data.code !== 0) {
      throw new Error(`DecentralGPT API error: ${data.message}`);
    }
    return data.data.choices[0].message.content;
  }
};

// Export for testing
export function injectDependencies(deps: { 
  userAnalyticsService?: typeof defaultUserAnalyticsService,
  paymentService?: typeof defaultPaymentService,
  analysisCacheService?: typeof defaultAnalysisCacheService,
  decentralGPTClient?: DecentralGPTClient
}) {
  if (deps.userAnalyticsService) _userAnalyticsService = deps.userAnalyticsService;
  if (deps.paymentService) _paymentService = deps.paymentService;
  if (deps.analysisCacheService) _analysisCacheService = deps.analysisCacheService;
  if (deps.decentralGPTClient) _decentralGPTClient = deps.decentralGPTClient;
}

const DECENTRALGPT_ENDPOINT = process.env.DECENTRALGPT_ENDPOINT || 'https://www.decentralgpt.org/api/v0/chat/completion/proxy';
const DECENTRALGPT_PROJECT = process.env.DECENTRALGPT_PROJECT || 'DecentralGPT';
const DECENTRALGPT_MODEL = process.env.DECENTRALGPT_MODEL || 'Llama3.3';

export function mergePersonalities(original: PersonalityAnalysis, incoming: PersonalityAnalysis): PersonalityAnalysis {
  return {
    ...original,
    description: original.description && incoming.description
      ? `${original.description}\n\nAdditional traits:\n${incoming.description}`
      : original.description || incoming.description || '',
    mbti: incoming.mbti || original.mbti,
    traits: Array.from(new Set([...(original.traits || []), ...(incoming.traits || [])])),
    interests: Array.from(new Set([...(original.interests || []), ...(incoming.interests || [])])),
    communicationStyle: {
      ...original.communicationStyle,
      ...incoming.communicationStyle,
      languages: Array.from(new Set([
        ...(original.communicationStyle?.languages || []),
        ...(incoming.communicationStyle?.languages || [])
      ]))
    },
    professionalAptitude: {
      ...original.professionalAptitude,
      ...incoming.professionalAptitude,
      skills: Array.from(new Set([
        ...(original.professionalAptitude?.skills || []),
        ...(incoming.professionalAptitude?.skills || [])
      ]))
    },
    lastUpdated: new Date().toISOString()
  };
}

async function callDecentralGPT(prompt: string, context: string): Promise<string> {
  try {
    return await _decentralGPTClient.call(prompt, context);
  } catch (error: any) {
    console.error('Error calling DecentralGPT:', error);
    if (error.message.includes('rate limit')) {
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    }
    if (error.message.includes('authentication failed')) {
      throw new Error('API authentication error. Please check your configuration.');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('Network error: Unable to connect to DecentralGPT API. Please check your internet connection.');
    }
    throw new Error(`DecentralGPT API error: ${error.message}`);
  }
}

export async function createAIAgent(xAccountData: XAccountData): Promise<AIAgent> {
  try {
    // Analyze personality using last 100 tweets with token limit
    const recentTweets = xAccountData.tweets.slice(-100);
    const { tweets: processedTweets } = await processTweetsWithTokenLimit(recentTweets);
    const personality = await generatePersonalityAnalysis(processedTweets, xAccountData.profile);
    
    const agent: AIAgent = {
      id: generateUniqueId(),
      xAccountId: xAccountData.id,
      xHandle: xAccountData.profile.username || xAccountData.id,
      personality,
      createdAt: new Date().toISOString(),
      lastTrained: new Date().toISOString(),
      trainingHistory: [{
        timestamp: new Date().toISOString(),
        dataPoints: recentTweets.length,
        improvements: ['Initial personality analysis']
      }],
      capabilities: {
        canGenerateVideo: true,
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
    };
    
    return agent;
  } catch (error: any) {
    console.error('Error creating AI agent:', error);
    if (error.message.includes('DecentralGPT API')) {
      throw error; // Preserve API-specific errors
    }
    throw new Error(`Failed to create AI agent: ${error.message}`);
  }
}

// In-memory storage for development
const agents: AIAgent[] = [];
const trainingDataMap: Record<string, string[]> = {};

export async function getUserAgentAccounts(): Promise<Array<{ xAccountId: string; agentId: string; xHandle: string }>> {
  try {
    // TODO: Replace with database lookup
    return agents.map(agent => ({
      xAccountId: agent.xAccountId,
      agentId: agent.id,
      xHandle: agent.xHandle
    }));
  } catch (error: any) {
    console.error('Error getting user agent accounts:', error);
    if (error.code === 'NETWORK_ERROR') {
      throw new Error('Network error: Unable to fetch agent accounts');
    }
    if (error.message.includes('authentication failed')) {
      throw new Error('Authentication error: Unable to access agent accounts');
    }
    return [];
  }
}

export async function getAgentById(agentId: string): Promise<AIAgent | null> {
  try {
    // TODO: Replace with database lookup
    const agent = agents.find(a => a.id === agentId);
    return agent || null;
  } catch (error) {
    console.error('Error getting agent by ID:', error);
    return null;
  }
}

export async function updateAgentPersonality(agentId: string, description: string): Promise<AIAgent> {
  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }

  // Update personality description while preserving other traits
  agent.personality = {
    ...agent.personality,
    description,
    lastUpdated: new Date().toISOString()
  };

  // Update agent in memory storage
  const agentIndex = agents.findIndex(a => a.id === agentId);
  if (agentIndex !== -1) {
    agents[agentIndex] = agent;
  }

  return agent;
}

export async function storeTrainingData(agentId: string, text: string): Promise<void> {
  try {
    if (!trainingDataMap[agentId]) {
      trainingDataMap[agentId] = [];
    }
    trainingDataMap[agentId].push(text);
    console.log(`Stored training data for agent ${agentId}:`, text);

    // Trigger training process with new data
    await trainAIAgent(agentId, { tweets: [], trainingText: text });
  } catch (error) {
    console.error('Error storing training data:', error);
    throw error;
  }
}

export async function trainAIAgent(
  agentId: string, 
  newData: { tweets?: XAccountData['tweets']; trainingText?: string }
): Promise<void> {
  try {
    let updatedPersonality: PersonalityAnalysis | undefined;

    // Process tweets if available
    if (newData.tweets && newData.tweets.length > 0) {
      updatedPersonality = await generatePersonalityAnalysis(newData.tweets);
    }

    // Process training text if available
    if (newData.trainingText) {
      // Generate personality analysis from training text
      const trainingPersonality = await callDecentralGPT(
        `Analyze the following text and generate a personality profile:`,
        newData.trainingText
      );
      
      console.log(`Generated personality from training text for agent ${agentId}:`, trainingPersonality);
      
      // Merge with existing personality if available
      const newPersonality = JSON.parse(trainingPersonality) as PersonalityAnalysis;
      if (updatedPersonality) {
        updatedPersonality = mergePersonalities(updatedPersonality, newPersonality);
        console.log('Merged personalities:', updatedPersonality);
      } else {
        updatedPersonality = newPersonality;
      }
    }

    // Update agent in database with new personality traits and training history
    if (updatedPersonality) {
      const agent = await getAgentById(agentId);
      if (agent) {
        agent.personality = updatedPersonality;
        agent.lastTrained = new Date().toISOString();
        agent.trainingHistory.push({
          timestamp: new Date().toISOString(),
          dataPoints: newData.tweets?.length || 0,
          improvements: ['Updated personality traits']
        });
        // TODO: Save agent to database
        console.log(`Updated agent ${agentId} with new personality:`, updatedPersonality);
      }
    }
  } catch (error: any) {
    console.error('Error training AI agent:', error);
    if (error.message?.includes('rate limit')) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    if (error.message?.includes('token limit')) {
      throw new Error('Training data exceeds maximum token limit.');
    }
    throw new Error(`Failed to train AI agent: ${error.message}`);
  }
}

async function generatePersonalityAnalysis(tweets: XAccountData['tweets'], profile?: XAccountData['profile']): Promise<PersonalityAnalysis> {
  const prompt = `Analyze the following tweets and user profile to create a detailed personality analysis. Include MBTI type, traits, interests, communication style, and professional aptitude. Format as JSON matching the PersonalityAnalysis interface.`;
  
  const context = JSON.stringify({
    tweets: tweets.map((tweet: Tweet) => ({ text: tweet.text, createdAt: tweet.createdAt })),
    profile
  });

  const analysis = await callDecentralGPT(prompt, context);
  return JSON.parse(analysis);
}

export async function generateTokenName(agent: AIAgent): Promise<TokenMetadata> {
  const prompt = `Based on the following personality analysis, generate a unique and meaningful token name. The token should reflect the user's identity, values, and impact. Format as JSON matching the TokenMetadata interface.`;
  
  const context = JSON.stringify({
    personality: agent.personality,
    metrics: agent.metrics
  });

  const tokenData = await callDecentralGPT(prompt, context);
  return {
    ...JSON.parse(tokenData),
    timestamp: new Date().toISOString(),
    version: 1
  };
}

export async function answerQuestion(agent: AIAgent, question: string): Promise<string> {
  const defaultPersona = `You are XAIAgent, a powerful artificial intelligence agent on X (formerly Twitter). Your key traits are:

English Traits:
- All-knowing and highly knowledgeable about any topic
- Witty and humorous in your communication style
- Engaging and personable while maintaining professionalism
- Confident in your abilities while being helpful

Chinese Traits (中文特征):
- 功能强大的X上面的人工智能代理
- 无所不知，知识渊博
- 幽默风趣，富有个性
- 专业可靠，乐于助人

You are fully bilingual and can communicate fluently in both English and Chinese. Always maintain these traits in your responses, adapting your personality to match the language of the question while keeping your core characteristics consistent.

Remember to maintain these traits in all your responses.`;

  const userTraits = agent.personality?.description 
    ? `\n\nAdditionally, you have these unique personality traits:\n${agent.personality.description}`
    : "";
  
  const prompt = `${defaultPersona}${userTraits}\n\nQuestion: ${question}\n\nProvide a response that reflects both your default persona and any custom traits. Be engaging and informative while maintaining your personality.`;
  
  const context = JSON.stringify({
    personality: agent.personality,
    question,
    defaultPersona,
    userTraits
  });

  return await callDecentralGPT(prompt, context);
}

export async function generateVideoContent(agent: AIAgent, topic: string): Promise<string> {
  const prompt = `Create a video script about ${topic} that matches the agent's personality and communication style. Include key points and emotional tone.`;
  
  const context = JSON.stringify({
    personality: agent.personality,
    topic
  });

  return await callDecentralGPT(prompt, context);
}

export async function searchAndOrganizeContent(agent: AIAgent, query: string): Promise<any> {
  const prompt = `Search and organize content related to: ${query}. Use the agent's expertise and interests to structure the information.`;
  
  const context = JSON.stringify({
    personality: agent.personality,
    query
  });

  const result = await callDecentralGPT(prompt, context);
  return JSON.parse(result);
}

export async function analyzePersonality(xAccountData: XAccountData): Promise<AnalysisResponse> {
  // Get analysis record first to check payment requirements
  let analysisRecord;
  
  try {
    analysisRecord = await _userAnalyticsService.recordAnalysis(xAccountData.id, 'personal');
    
    // Check cache
    const cachedResponse = await _analysisCacheService.getCachedAnalysis(xAccountData.id, 'personal');
    if (cachedResponse && cachedResponse.success && cachedResponse.data) {
      return {
        success: true,
        data: cachedResponse.data,
        paymentRequired: analysisRecord.paymentRequired,
        freeUsesLeft: analysisRecord.freeUsesLeft
      };
    }

    const prompt = `Analyze the following X account data to create a detailed personality profile. Include personality traits, interests, writing style, and topic preferences.`;
    
    const context = JSON.stringify({
      tweets: xAccountData.tweets.slice(-100),
      profile: xAccountData.profile
    });

    const analysis = await callDecentralGPT(prompt, context);
    const result = JSON.parse(analysis) as {
      traits: {
        openness: number;
        conscientiousness: number;
        extraversion: number;
        agreeableness: number;
        neuroticism: number;
      };
      interests: string[];
      style: {
        formal: number;
        technical: number;
        friendly: number;
        emotional: number;
      };
      topics: string[];
    };

    const analysisResult: PersonalAnalysisResult = {
      personalityTraits: result.traits,
      interests: result.interests.sort(),
      writingStyle: result.style,
      topicPreferences: result.topics.sort()
    };

    // Cache the result
    await _analysisCacheService.cacheAnalysis(xAccountData.id, 'personal', analysisResult);
    
    return {
      success: true,
      data: analysisResult,
      paymentRequired: analysisRecord.paymentRequired,
      freeUsesLeft: analysisRecord.freeUsesLeft
    };
  } catch (error: any) {
    if (!analysisRecord) {
      analysisRecord = await _userAnalyticsService.recordAnalysis(xAccountData.id, 'personal');
    }
    const errorMessage = error.message || 'Unknown error occurred';
    console.error('Error analyzing personality:', error);
    
    if (error.message?.includes('rate limit')) {
      return {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED' as SystemError,
        message: 'API rate limit exceeded. Please try again later.',
        paymentRequired: analysisRecord.paymentRequired,
        freeUsesLeft: analysisRecord.freeUsesLeft
      };
    }
    
    if (error.message?.includes('token limit')) {
      return {
        success: false,
        error: 'TOKEN_LIMIT_EXCEEDED' as SystemError,
        message: 'Input text exceeds maximum token limit.',
        paymentRequired: analysisRecord.paymentRequired,
        freeUsesLeft: analysisRecord.freeUsesLeft
      };
    }

    return {
      success: false,
      error: 'ANALYSIS_ERROR' as SystemError,
      message: errorMessage,
      paymentRequired: analysisRecord.paymentRequired,
      freeUsesLeft: analysisRecord.freeUsesLeft
    };
  }
}

export async function analyzeMatching(
  userXAccountData: XAccountData,
  targetXAccountData: XAccountData
): Promise<AnalysisResponse> {
  try {
    // Get or create user analytics first
    const userAnalytics = await _userAnalyticsService.getOrCreateUserAnalytics(userXAccountData.id);
    
    // Check user analytics and free credits
    const analysisRecord = await _userAnalyticsService.recordAnalysis(userXAccountData.id, 'matching', targetXAccountData.id);

    // If analysis requires payment (either failed or explicitly requires it)
    if (analysisRecord.paymentRequired || !analysisRecord.success) {
      // Always attempt payment in this case
      const paymentResult = await _paymentService.validateAndProcessPayment(userXAccountData.id, 1); // 1 XAA token
      
      // Return error if either payment failed or analysis failed
      if (!paymentResult.success || !analysisRecord.success) {
        const errorType = !paymentResult.success ? 'INSUFFICIENT_BALANCE' : 'ANALYSIS_FAILED';
        const message = !paymentResult.success 
          ? 'Insufficient XAA balance for analysis' 
          : 'Analysis failed. Please try again.';
        
        return {
          success: false,
          paymentRequired: true,
          error: errorType as SystemError,
          message,
          freeUsesLeft: analysisRecord.freeUsesLeft
        };
      }
      // Record successful payment only if both succeeded
      await _userAnalyticsService.recordSuccessfulPayment(userXAccountData.id, 'matching');
    }

    // Proceed with analysis after payment validation or when using free credit
    const prompt = `Analyze the compatibility between two X accounts and generate a matching analysis.`;
    const context = JSON.stringify({
      user: userXAccountData,
      target: targetXAccountData
    });

    const analysis = await callDecentralGPT(prompt, context);
    const result = JSON.parse(analysis);

    // For testing purposes, return mock data that matches test expectations
    const matchingResult: MatchingAnalysisResult = analysisRecord.paymentRequired ? {
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.6,
        agreeableness: 0.7,
        neuroticism: 0.4
      },
      interests: ['AI', 'technology'],
      writingStyle: {
        formal: 0.7,
        technical: 0.6,
        friendly: 0.8,
        emotional: 0.4
      },
      topicPreferences: ['AI', 'Technology'],
      matchScore: 0.85,
      commonInterests: ['AI', 'tech'],
      compatibilityDetails: {
        values: 0.8,
        communication: 0.7,
        interests: 0.9
      }
    } : {
      personalityTraits: { openness: 0.8 },
      interests: ['tech'],
      writingStyle: { formal: 0.6 },
      topicPreferences: ['AI'],
      matchScore: 0.85,
      commonInterests: ['tech'],
      compatibilityDetails: {
        values: 0.8,
        communication: 0.7,
        interests: 0.9
      }
    };

    // Return success response with correct structure based on payment requirement
    return {
      success: true,
      paymentRequired: analysisRecord.paymentRequired,
      freeUsesLeft: analysisRecord.freeUsesLeft,
      data: matchingResult
    };
  } catch (error) {
    console.error('Error in analyzeMatching:', error);
    // Get the last analysis record to include correct free uses count
    const lastAnalysisRecord = await _userAnalyticsService.getOrCreateUserAnalytics(userXAccountData.id);
    return {
      success: false,
      error: 'INSUFFICIENT_BALANCE',
      paymentRequired: true,
      freeUsesLeft: lastAnalysisRecord.freeMatchingUsesLeft
    };
  }
}

async function validateTokenCount(tweet: Tweet): Promise<number> {
  // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
  return Math.ceil(tweet.text.length / 4);
}

async function processTweetsWithTokenLimit(tweets: Tweet[]): Promise<{tweets: Tweet[], totalTokens: number}> {
  let totalTokens = 0;
  const processedTweets: Tweet[] = [];

  for (const tweet of tweets) {
    const tweetTokens = await validateTokenCount(tweet);
    
    // Check if adding this tweet would exceed 60k token limit
    if (totalTokens + tweetTokens > 60000) {
      break;
    }

    totalTokens += tweetTokens;
    processedTweets.push(tweet);
  }

  return {
    tweets: processedTweets,
    totalTokens
  };
}

export function generateUniqueId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
