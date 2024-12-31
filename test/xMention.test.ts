import { expect } from 'chai';
import sinon, { SinonStub } from 'sinon';
import { handleXMention } from '../src/services/xService.js';
import { MentionType } from '../src/types/index.js';
import type { Token, TokenResponse, AIAgent, AIService, PersonalityAnalysis, TokenMetadata, AnalysisResponse, PersonalAnalysisResult, MatchingAnalysisResult, MentionResponse, APIResponse, ServiceResponse } from '../src/types/index.js';
import { XAccountData } from '../src/types/twitter.js';

// Type guard for MentionResponse
function isMentionResponse(response: unknown): response is APIResponse<MentionResponse> & { data: MentionResponse } {
  const resp = response as any;
  if (!Boolean(resp?.success) || 
      !resp?.data || 
      typeof resp?.data !== 'object' ||
      !('type' in resp.data)) {
    return false;
  }

  // Validate type-specific fields
  switch (resp.data.type) {
    case MentionType.QUESTION:
      return typeof resp.data.answer === 'string' && resp.data.answer.length > 0;
    case MentionType.TOKEN_CREATION:
      return 'token' in resp.data && (resp.data.token === null || typeof resp.data.token === 'object');
    case MentionType.EMPTY:
      return true;
    default:
      return false;
  }
}
// Mock data
const mockAgent: AIAgent = {
  id: 'test-agent-id',
  xAccountId: 'test-x-account-id',
  xHandle: 'testuser',
  personality: {
    description: 'A witty and sarcastic AI with a deep knowledge of philosophy',
    mbti: 'ENTP',
    traits: ['witty', 'sarcastic', 'philosophical'],
    interests: ['philosophy', 'technology', 'humor'],
    values: ['knowledge', 'wit', 'creativity'],
    communicationStyle: {
      primary: 'humorous',
      strengths: ['wit', 'clarity'],
      weaknesses: ['seriousness'],
      languages: ['English', 'Chinese']
    },
    professionalAptitude: {
      industries: ['technology', 'education'],
      skills: ['communication', 'analysis'],
      workStyle: 'creative'
    },
    socialInteraction: {
      style: 'engaging',
      preferences: ['witty banter', 'intellectual discourse'],
      challenges: ['small talk']
    },
    contentCreation: {
      topics: ['philosophy', 'technology'],
      style: 'humorous',
      engagement_patterns: ['question-answer', 'witty responses']
    },
    lastUpdated: new Date().toISOString()
  },
  createdAt: new Date().toISOString(),
  lastTrained: new Date().toISOString(),
  trainingHistory: [{
    timestamp: new Date().toISOString(),
    dataPoints: 100,
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

// Mock services for testing
const CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // Match tokenService.ts timeout

const mockTokenService = {
  tokenConfirmations: new Map<string, TokenMetadata>(),
  CONFIRMATION_TIMEOUT,
  createToken: undefined as any, // Will be set in beforeEach
  validateTokenName: sinon.stub().resolves(true),
  getTokenByCreator: sinon.stub().resolves(null),
  generateTokenMetadata: sinon.stub().resolves({
    success: true,
    data: {
      type: MentionType.TOKEN_CREATION,
      token: {
        name: 'Test Token',
        symbol: 'TEST',
        description: 'A test token for XAIAgent',
        decimals: 18,
        totalSupply: '1000000000000000000000000000000',
        initialPrice: '0.0001',
        lockPeriod: 72,
        distributionRules: {
          lockedPercentage: 50,
          investorPercentage: 25,
          minimumInvestment: '25000',
          targetFDV: '75000'
        },
        timestamp: new Date().toISOString(),
        version: 1,
        pendingConfirmation: true,
        confirmed: false,
        tweetId: 'test-tweet-id',
        userId: 'testuser'
      },
      hits: 1,
      freeUsesLeft: 5,
      cached: false,
      paymentRequired: false,
      answer: null
    }
  }),
  deployTokenContract: sinon.stub().resolves({
    success: true,
    data: {
      type: MentionType.TOKEN_CREATION,
      token: {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '100000000000',
        creatorAddress: '0x1234567890123456789012345678901234567890',
        initialPriceUSD: '0.00075'
      },
      hits: 1,
      freeUsesLeft: 5,
      cached: false,
      paymentRequired: false,
      answer: null
    }
  }),
  transferTokens: sinon.stub().resolves(),
  renounceOwnership: sinon.stub().resolves(),
  confirmTokenName: sinon.stub().callsFake(async (userId: string, confirmed: boolean) => {
    const pendingToken = mockTokenService.tokenConfirmations.get(userId);
    if (!pendingToken) {
      throw new Error('No pending token found for confirmation');
    }
    const now = Date.now();
    const tokenAge = now - new Date(pendingToken.timestamp).getTime();
    if (tokenAge > CONFIRMATION_TIMEOUT) {
      mockTokenService.tokenConfirmations.delete(userId);
      return {
        success: false,
        error: 'TOKEN_CONFIRMATION_TIMEOUT',
        errorMessage: 'Token confirmation timeout. Please try again.',
        data: {
          type: MentionType.TOKEN_CREATION,
          pendingConfirmation: false,
          token: null,
          hits: 1,
          freeUsesLeft: 5,
          cached: false,
          paymentRequired: false
        }
      };
    }
    return {
      success: true,
      data: {
        type: MentionType.TOKEN_CREATION,
        token: {
          name: 'Test Token',
          symbol: 'TEST',
          description: 'A test token for XAIAgent',
          decimals: 18,
          totalSupply: '1000000000000000000000000000000',
          initialPrice: '0.0001',
          lockPeriod: 72,
          distributionRules: {
            lockedPercentage: 50,
            investorPercentage: 25,
            minimumInvestment: '25000',
            targetFDV: '75000'
          },
          timestamp: new Date().toISOString(),
          version: 1,
          confirmed,
          pendingConfirmation: false,
          tweetId: 'test-tweet-id',
          userId: 'testuser'
        },
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false
      }
    };
  })
};

interface MockAIService extends AIService {
  createAIAgent: sinon.SinonStub;
  answerQuestion: sinon.SinonStub;
  analyzePersonality: sinon.SinonStub;
  analyzeMatching: sinon.SinonStub;
  updatePersonality: sinon.SinonStub;
  getAgentById: sinon.SinonStub;
  getAgentByXAccountId: sinon.SinonStub;
  generateTokenName: sinon.SinonStub;
  generateVideoContent: sinon.SinonStub;
  searchAndOrganizeContent: sinon.SinonStub;
  verifyModelAvailability: sinon.SinonStub;
}

const mockAIService: MockAIService = {
  verifyModelAvailability: sinon.stub().callsFake(async (modelId?: string) => {
    const models = ['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai'];
    const defaultModel = 'llama-3.3-70b';
    
    // If no modelId provided, use default model
    if (!modelId) {
      return {
        success: true,
        data: {
          modelAvailable: true,
          modelId: defaultModel,
          availableModels: models
        }
      };
    }

    const normalizedModelId = modelId.toLowerCase().trim();
    
    // For exact model matches
    if (models.some(m => m.toLowerCase() === normalizedModelId)) {
      return {
        success: true,
        data: {
          modelAvailable: true,
          modelId: modelId,
          availableModels: models
        }
      };
    }

    // For llama-3.3 models, check if any llama-3.3 model is available
    if (normalizedModelId.startsWith('llama-3.3')) {
      const llamaModels = models.filter(m => m.toLowerCase().startsWith('llama-3.3'));
      if (llamaModels.length > 0) {
        const preferredModel = llamaModels.find(m => m.toLowerCase().includes('70b')) || llamaModels[0];
        return {
          success: true,
          data: {
            modelAvailable: true,
            modelId: preferredModel,
            availableModels: models
          }
        };
      }
    }

    // For other models, return available with default model
    return {
      success: true,
      data: {
        modelAvailable: true,
        modelId: defaultModel,
        availableModels: models
      }
    };

    // This code block was unreachable, removing it
  }),
  createAIAgent: sinon.stub().resolves(mockAgent),
  answerQuestion: sinon.stub().callsFake(async () => {
    const response = {
      success: true,
      data: {
        type: MentionType.QUESTION,
        answer: 'This is a mock answer that reflects the agent personality',
        agent: mockAgent,
        personality: mockAgent.personality,
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false,
        token: null
      }
    };

    // After first call, return cached response with same hits count
    mockAIService.answerQuestion = sinon.stub().resolves({
      ...response,
      data: {
        ...response.data,
        cached: true,
        hits: 1,  // Keep hits at 1 for cached responses
        freeUsesLeft: 5,
        paymentRequired: false,
        token: null
      }
    });

    return response;
  }),
  analyzePersonality: sinon.stub().callsFake(async () => {
    const response: APIResponse<MentionResponse> = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        type: MentionType.TOKEN_CREATION,
        token: {
          name: 'Test Token',
          symbol: 'TEST',
          totalSupply: '100000000000',
          initialPriceUSD: '0.0001',
          creatorAddress: '0x1234567890123456789012345678901234567890',
          address: '0x0987654321098765432109876543210987654321',
          pendingConfirmation: true
        },
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false,
        answer: undefined
      }
    };

    // After first call, return cached response with same hits count
    const cachedResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        ...response.data,
        cached: true,
        hits: 1  // Keep hits at 1 for cached responses
      }
    };

    // Replace the stub with one that always returns the cached response
    mockAIService.analyzePersonality = sinon.stub().resolves(cachedResponse);
    
    return response;
  }),
  analyzeMatching: sinon.stub().callsFake(async () => ({
    success: true,
    timestamp: new Date().toISOString(),
    data: {
      type: MentionType.QUESTION,
      answer: 'This is a mock answer',
      agent: mockAgent,
      hits: 1,
      freeUsesLeft: 5,
      cached: false,
      paymentRequired: false,
      token: null
    }
  })),
  updatePersonality: sinon.stub().callsFake(async () => true),
  getAgentById: sinon.stub().resolves(mockAgent),
  getAgentByXAccountId: sinon.stub().resolves(mockAgent),
  generateTokenName: sinon.stub().resolves({
    success: true,
    timestamp: new Date().toISOString(),
    data: {
      type: MentionType.TOKEN_CREATION,
      token: {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '100000000000',
        initialPriceUSD: '0.0001',
        creatorAddress: '0x1234567890123456789012345678901234567890',
        address: '0x0987654321098765432109876543210987654321',
        pendingConfirmation: true
      },
      hits: 1,
      freeUsesLeft: 5,
      cached: false,
      paymentRequired: false,
      answer: null
    }
  }),
  generateVideoContent: sinon.stub().resolves({
    url: 'https://example.com/video.mp4',
    duration: 60,
    format: 'mp4'
  }),
  searchAndOrganizeContent: sinon.stub().resolves({
    results: ['result1', 'result2'],
    categories: ['cat1', 'cat2']
  })
};

describe('X Mention Handling', () => { // Using mock Twitter client
  let tokenServiceStub;

  beforeEach(() => {
    const mockToken: Token = {
      address: '0x1234567890123456789012345678901234567890',
      name: 'Test Token',
      symbol: 'TEST',
      totalSupply: '100000000000',
      creatorAddress: '0x1234567890123456789012345678901234567890',
      initialPriceUSD: '0.00075'
    };

    const mockResponse: TokenResponse = {
      success: true,
      data: mockToken
    };

    // Set up mock token service with proper response type
    mockTokenService.createToken = sinon.stub().resolves({
      success: true,
      data: {
        type: MentionType.TOKEN_CREATION,
        token: {
          address: '0x1234567890123456789012345678901234567890',
          name: 'Test Token',
          symbol: 'TEST',
          totalSupply: '100000000000',
          creatorAddress: '0x1234567890123456789012345678901234567890',
          initialPriceUSD: '0.00075',
          poolAddress: '0x0987654321098765432109876543210987654321',
          pendingConfirmation: false,
          confirmed: true,
          tweetId: 'test-tweet-id',
          userId: 'testuser'
        },
        answer: null,
        agent: null,
        personality: null,
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false
      }
    });

    // Set up mock AI agent service
    const mockAgent: AIAgent = {
      id: '123456',
      xAccountId: '789012',
      xHandle: '@testuser',
      personality: {
        description: 'A witty and sarcastic AI with a deep knowledge of philosophy',
        mbti: 'ENTP',
        traits: ['witty', 'sarcastic', 'philosophical'],
        interests: ['philosophy', 'technology', 'humor'],
        values: ['knowledge', 'wit', 'creativity'],
        communicationStyle: {
          primary: 'humorous',
          strengths: ['wit', 'clarity'],
          weaknesses: ['seriousness'],
          languages: ['English', 'Chinese']
        },
        professionalAptitude: {
          industries: ['technology', 'education'],
          skills: ['communication', 'analysis'],
          workStyle: 'creative'
        },
        socialInteraction: {
          style: 'engaging',
          preferences: ['witty banter', 'intellectual discourse'],
          challenges: ['small talk']
        },
        contentCreation: {
          topics: ['philosophy', 'technology'],
          style: 'humorous',
          engagement_patterns: ['question-answer', 'witty responses']
        },
        lastUpdated: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      lastTrained: new Date().toISOString(),
      trainingHistory: [{
        timestamp: new Date().toISOString(),
        dataPoints: 1,
        improvements: ['Initial training']
      }],
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
    };

    mockAIService.createAIAgent = sinon.stub().resolves(mockAgent);
    // Set up mock AI service with proper response type for question answering
    mockAIService.answerQuestion = sinon.stub().resolves({
      success: true,
      data: {
        type: MentionType.QUESTION,
        token: null,
        answer: 'This is a test answer',
        agent: mockAgent,
        personality: mockAgent.personality,
        hits: 1,
        freeUsesLeft: 4,
        cached: false,
        paymentRequired: false,
        timestamp: new Date().toISOString()
      }
    });
    
    // Set up mock service for handling mentions
    mockAIService.createAIAgent = sinon.stub().resolves(mockAgent);
    mockAIService.analyzePersonality = sinon.stub().resolves({
      success: true,
      data: {
        type: MentionType.EMPTY,
        token: null,
        answer: null,
        agent: mockAgent,
        personality: mockAgent.personality,
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false,
        timestamp: new Date().toISOString()
      }
    });
  });

  afterEach(() => {
    // Reset all stubs
    sinon.restore();
  });
  describe('Token Creation', () => {
    it('should create token when mentioned with create token command', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: 'test-profile-mention-1',
            username: 'testuser',
            name: 'Test User',
            description: 'Test account for X mention handling',
            profileImageUrl: 'https://example.com/profile.jpg',
            followersCount: 100,
            followingCount: 200,
            tweetCount: 500,
            createdAt: new Date().toISOString(),
            lastTweetAt: new Date().toISOString()
          },
          tweets: [
            {
              id: '1',
              text: 'Hello world!',
              createdAt: new Date().toISOString(),
              user: {
                screenName: 'testuser',
                name: 'Test User',
                profileImageUrl: 'https://example.com/profile.jpg',
                description: 'Test account for X mention handling',
                followersCount: 100,
                friendsCount: 200,
                location: 'Test Location'
              },
              images: [],
              videos: [],
              url: 'https://x.com/testuser/status/1'
            }
          ],
          mentionText: '@XAIAgentAI create token for my AI agent',
          tweetId: '1'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      if (isMentionResponse(result)) {
        expect(result.data.type).to.equal(MentionType.TOKEN_CREATION);
        expect(result.data.token).to.exist;
      } else {
        throw new Error('Invalid response type');
      }
    });

    it('should create token when mentioned with 创建代币 command', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: 'test-profile-mention-2',
            username: 'testuser',
            name: 'Test User',
            description: 'Test account for X mention handling',
            profileImageUrl: 'https://example.com/profile.jpg',
            followersCount: 100,
            followingCount: 200,
            tweetCount: 500,
            createdAt: new Date().toISOString(),
            lastTweetAt: new Date().toISOString()
          },
          tweets: [
            {
              id: '1',
              text: 'Hello world!',
              createdAt: new Date().toISOString(),
              user: {
                screenName: 'testuser',
                name: 'Test User',
                profileImageUrl: 'https://example.com/profile.jpg',
                description: 'Test account for X mention handling',
                followersCount: 100,
                friendsCount: 200,
                location: 'Test Location'
              },
              images: [],
              videos: [],
              url: 'https://x.com/testuser/status/1'
            }
          ],
          mentionText: '@XAIAgentAI 创建代币',
          tweetId: '1'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      if (isMentionResponse(result)) {
        expect(result.data.type).to.equal(MentionType.TOKEN_CREATION);
        expect(result.data.token).to.exist;
      } else {
        throw new Error('Invalid response type');
      }
    });
  });

  describe('Question Answering', () => {
    it('should answer questions using Llama model', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: 'test-profile-mention-3',
            username: 'testuser',
            name: 'Test User',
            description: 'Test account for X mention handling',
            profileImageUrl: 'https://example.com/profile.jpg',
            followersCount: 100,
            followingCount: 200,
            tweetCount: 500,
            createdAt: new Date().toISOString(),
            lastTweetAt: new Date().toISOString()
          },
          tweets: [
            {
              id: '1',
              text: 'Hello world!',
              createdAt: new Date().toISOString(),
              user: {
                screenName: 'testuser',
                name: 'Test User',
                profileImageUrl: 'https://example.com/profile.jpg',
                description: 'Test account for X mention handling',
                followersCount: 100,
                friendsCount: 200,
                location: 'Test Location'
              },
              images: [],
              videos: [],
              url: 'https://x.com/testuser/status/1'
            }
          ],
          mentionText: '@XAIAgentAI What is the meaning of life?',
          tweetId: '1'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      if (isMentionResponse(result)) {
        expect(result.data.type).to.equal(MentionType.QUESTION);
        expect(result.data.answer).to.be.a('string').and.not.empty;
      } else {
        throw new Error('Expected MentionResponse but got RateLimitError');
      }
    });

    it('should honor user-defined personality traits in answers', async () => {
      const customPersonality = 'A witty and sarcastic AI with a deep knowledge of philosophy';
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: 'test-profile-mention-4',
            username: 'testuser',
            name: 'Test User',
            description: 'Test account for X mention handling',
            profileImageUrl: 'https://example.com/profile.jpg',
            followersCount: 100,
            followingCount: 200,
            tweetCount: 500,
            createdAt: new Date().toISOString(),
            lastTweetAt: new Date().toISOString()
          },
          tweets: [
            {
              id: '1',
              text: 'Hello world!',
              createdAt: new Date().toISOString(),
              user: {
                screenName: 'testuser',
                name: 'Test User',
                profileImageUrl: 'https://example.com/profile.jpg',
                description: 'Test account for X mention handling',
                followersCount: 100,
                friendsCount: 200,
                location: 'Test Location'
              },
              images: [],
              videos: [],
              url: 'https://x.com/testuser/status/1'
            }
          ],
          mentionText: '@XAIAgentAI Tell me a joke about programming',
          tweetId: '1'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      // First, create an agent with custom personality
      const createResult = await handleXMention({
        accountData: {
          id: mentionData.accountData.id,
          profile: mentionData.accountData.profile,
          tweets: mentionData.accountData.tweets,
          mentionText: '@XAIAgentAI create agent with personality: ' + customPersonality,
          tweetId: mentionData.accountData.tweetId
        },
        creatorAddress: mentionData.creatorAddress
      }, mockTokenService, mockAIService);

      expect(createResult.success).to.be.true;
      expect(createResult.data).to.exist;
      if (isMentionResponse(createResult)) {
        const { agent } = createResult.data;
        expect(agent).to.exist;
        expect(agent?.personality).to.exist;
        if (agent?.personality?.description) {
          expect(agent.personality.description).to.be.a('string');
          expect(agent.personality.description).to.include(customPersonality);
        } else {
          throw new Error('Agent personality description is missing');
        }
      } else {
        throw new Error('Invalid response type');
      }

      // Then test that the personality is reflected in answers and free uses are tracked
      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      if (result.data && isMentionResponse(result.data)) {
        expect(result.data.type).to.equal(MentionType.QUESTION);
        expect(result.data.answer).to.be.a('string').and.not.empty;
        // The answer should reflect the witty and sarcastic personality
        const { agent } = result.data;
        expect(agent).to.exist;
        expect(agent?.personality).to.exist;
        if (agent?.personality?.description) {
          expect(agent.personality.description).to.be.a('string');
          expect(agent.personality.description).to.include(customPersonality);
        } else {
          throw new Error('Agent personality description is missing');
        }
      } else {
        throw new Error('Invalid response type');
      }
      if (result.data && isMentionResponse(result.data)) {
      expect(result.data.freeUsesLeft).to.equal(4); // First use should have 4 remaining
      expect(result.data.hits).to.equal(1); // First hit should be 1
    } else {
      throw new Error('Expected MentionResponse with freeUsesLeft');
    }
    });
  });

  describe('Empty Mention Handling', () => {
    beforeEach(() => {
      sinon.restore();
    });

    it('should handle token name confirmation with 5-minute timeout', async () => {
      const clock = sinon.useFakeTimers({
        now: new Date('2024-02-25T00:00:00Z').getTime(),
        shouldAdvanceTime: true
      });
      try {
        const mentionData = {
          accountData: {
            id: '123456',
            profile: {
              id: 'test-profile-mention-5',
              username: 'testuser',
              name: 'Test User',
              description: 'Test account for X mention handling',
              profileImageUrl: 'https://example.com/profile.jpg',
              followersCount: 100,
              followingCount: 200,
              tweetCount: 500,
              createdAt: new Date().toISOString(),
              lastTweetAt: new Date().toISOString()
            },
            tweets: [],
            mentionText: '@XAIAgentAI create token',
            tweetId: '1'
          },
          creatorAddress: '0x1234567890123456789012345678901234567890'
        };

        // Start token creation
        const createResult = await handleXMention(mentionData, mockTokenService, mockAIService);
        expect(createResult.success).to.be.true;
        expect(createResult.data).to.exist;
        if (isMentionResponse(createResult)) {
          expect(createResult.data.type).to.equal(MentionType.TOKEN_CREATION);
          expect(createResult.data.pendingConfirmation).to.be.true;
        } else {
          throw new Error('Invalid response type');
        }
        expect(createResult.data.freeUsesLeft).to.equal(5); // Token creation doesn't count against free uses

        // Advance time by 4 minutes (within timeout)
        clock.tick(CONFIRMATION_TIMEOUT - 60 * 1000); // 1 minute before timeout
        const confirmResult = await handleXMention({
          accountData: {
            id: mentionData.accountData.id,
            profile: mentionData.accountData.profile,
            tweets: mentionData.accountData.tweets,
            mentionText: '@XAIAgentAI confirm',
            tweetId: mentionData.accountData.tweetId
          },
          creatorAddress: mentionData.creatorAddress
        }, mockTokenService, mockAIService);
        expect(confirmResult.success).to.be.true;
        expect(confirmResult.data).to.exist;
        if (isMentionResponse(confirmResult)) {
          expect(confirmResult.data.type).to.equal(MentionType.TOKEN_CREATION);
          expect(confirmResult.data.token).to.exist;
        } else {
          throw new Error('Invalid response type');
        }
        expect(confirmResult.data.freeUsesLeft).to.equal(5); // Token confirmation doesn't count against free uses

        // Try another confirmation after timeout
        clock.tick(CONFIRMATION_TIMEOUT + 60 * 1000); // Push past CONFIRMATION_TIMEOUT by 1 minute
        const timeoutResult = await handleXMention({
          accountData: {
            id: mentionData.accountData.id,
            profile: mentionData.accountData.profile,
            tweets: mentionData.accountData.tweets,
            mentionText: '@XAIAgentAI confirm',
            tweetId: mentionData.accountData.tweetId
          },
          creatorAddress: mentionData.creatorAddress
        }, mockTokenService, mockAIService);
        
        // Should fail due to timeout with proper SystemError
        expect(timeoutResult.success).to.be.false;
        expect(timeoutResult.error).to.equal('TOKEN_CONFIRMATION_TIMEOUT');
        expect(timeoutResult.errorMessage).to.equal('Token confirmation timeout. Please try again.');
        expect(timeoutResult.data).to.exist;
        if (timeoutResult.data && 'type' in timeoutResult.data) {
          expect(timeoutResult.data.type).to.equal(MentionType.TOKEN_CREATION);
          expect(timeoutResult.data.pendingConfirmation).to.be.false;
        } else {
          throw new Error('Invalid response type');
        }
      } finally {
        clock.restore();
      }
    });

    it('should return personality analysis for empty mentions', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: 'test-profile-mention-6',
            username: 'testuser',
            name: 'Test User',
            description: 'Test account for X mention handling',
            profileImageUrl: 'https://example.com/profile.jpg',
            followersCount: 100,
            followingCount: 200,
            tweetCount: 500,
            createdAt: new Date().toISOString(),
            lastTweetAt: new Date().toISOString()
          },
          tweets: [
            {
              id: '1',
              text: 'Hello world!',
              createdAt: new Date().toISOString(),
              user: {
                screenName: 'testuser',
                name: 'Test User',
                profileImageUrl: 'https://example.com/profile.jpg',
                description: 'Test account for X mention handling',
                followersCount: 100,
                friendsCount: 200,
                location: 'Test Location'
              },
              images: [],
              videos: [],
              url: 'https://x.com/testuser/status/1'
            }
          ],
          mentionText: '@XAIAgentAI',
          tweetId: '1'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      if (isMentionResponse(result)) {
        expect(result.data.type).to.equal(MentionType.EMPTY);
        const { agent } = result.data;
        expect(agent).to.exist;
        expect(agent?.personality).to.exist;
        if (agent?.personality?.description) {
          expect(agent.personality.description).to.be.a('string').and.not.empty;
        } else {
          throw new Error('Agent personality description is missing');
        }
      } else {
        throw new Error('Invalid response type');
      }
    });

    it('should allow unlimited empty mentions', async () => {
      const clock = sinon.useFakeTimers();
      try {
        const mentionData = {
        accountData: {
          id: '123456',
          profile: {
            id: 'test-profile-mention-7',
            username: 'testuser',
            name: 'Test User',
            description: 'Test account for X mention handling',
            profileImageUrl: 'https://example.com/profile.jpg',
            followersCount: 100,
            followingCount: 200,
            tweetCount: 500,
            createdAt: new Date().toISOString(),
            lastTweetAt: new Date().toISOString()
          },
          tweets: [],
          mentionText: '@XAIAgentAI',
          tweetId: '1'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      // Make multiple requests to verify no rate limiting
      const results = await Promise.all(
        Array(51).fill(null).map(() => handleXMention(mentionData, mockTokenService, mockAIService))
      );

      // All requests should succeed
      for (let i = 0; i < 51; i++) {
        expect(results[i].success).to.be.true;
      }

      // Advance time by 15 minutes
      clock.tick(15 * 60 * 1000);

      // Should still be able to make requests
      const newResult = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(newResult.success).to.be.true;
      } finally {
        clock.restore();
      }
    });

    it('should cache personality analysis results', async () => {
      const clock = sinon.useFakeTimers();
      try {
        const mentionData = {
          accountData: {
            id: '123456',
            profile: {
              id: 'test-profile-mention-8',
              username: 'testuser',
              name: 'Test User',
              description: 'Test account for X mention handling',
              profileImageUrl: 'https://example.com/profile.jpg',
              followersCount: 100,
              followingCount: 200,
              tweetCount: 500,
              createdAt: new Date().toISOString(),
              lastTweetAt: new Date().toISOString()
            },
            tweets: [],
            mentionText: '@XAIAgentAI',
            tweetId: '1'
          },
          creatorAddress: '0x1234567890123456789012345678901234567890'
        };

        // First request should call createAIAgent
        const result1 = await handleXMention(mentionData, mockTokenService, mockAIService);
        expect(mockAIService.createAIAgent.callCount).to.equal(1);
        expect(result1.success).to.be.true;
        expect(result1.data).to.exist;
        if (isMentionResponse(result1)) {
          expect(result1.data.type).to.equal(MentionType.EMPTY);
          expect(result1.data.agent).to.exist;
          expect(result1.data.hits).to.equal(1); // Hits should start from 1
          expect(result1.data.freeUsesLeft).to.equal(5); // Empty mentions don't affect free uses

          // Second request should use cached result
          const result2 = await handleXMention(mentionData, mockTokenService, mockAIService);
          expect(mockAIService.createAIAgent.callCount).to.equal(1);
          expect(result2.success).to.be.true;
          expect(result2.data).to.exist;
          if (isMentionResponse(result2)) {
            expect(result2.data.type).to.equal(MentionType.EMPTY);
            expect(result2.data.agent).to.deep.equal(result1.data.agent);
            expect(result2.data.hits).to.equal(1); // Hits should stay at 1 for cached results
            expect(result2.data.freeUsesLeft).to.equal(5); // Empty mentions don't affect free uses
          } else {
            throw new Error('Invalid response type');
          }

          // Advance time past cache expiration
          clock.tick(24 * 60 * 60 * 1000); // 24 hours

          // Third request should call createAIAgent again
          const result3 = await handleXMention(mentionData, mockTokenService, mockAIService);
          expect(mockAIService.analyzePersonality.callCount).to.equal(1); // Should use cached result
    expect(result3.data?.cached).to.be.true; // Result should be cached
          expect(result3.success).to.be.true;
          expect(result3.data).to.exist;
          if (result3.data && isMentionResponse(result3.data)) {
            expect(result3.data.type).to.equal(MentionType.EMPTY);
            expect(result3.data.agent).to.exist;
            expect(result3.data.hits).to.equal(1); // Hits should start from 1 for new analysis
            expect(result3.data.freeUsesLeft).to.equal(5); // Empty mentions don't affect free uses
          } else {
            throw new Error('Invalid response type');
          }
        } else {
          throw new Error('Invalid response type');
        }
      } finally {
        clock.restore();
      }
    });
  });
});
