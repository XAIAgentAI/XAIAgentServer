import { expect } from 'chai';
import sinon from 'sinon';
import { handleXMention } from '../src/services/xService.js';
import { 
  MentionType, 
  Token, 
  TokenResponse, 
  AIAgent,
  AIService,
  PersonalityAnalysis,
  TokenMetadata,
  AnalysisResponse,
  PersonalAnalysisResult,
  MatchingAnalysisResult,
  MentionResponse
} from '../src/types/index.js';

// Type guard for MentionResponse
function isMentionResponse(data: any): data is MentionResponse {
  return data !== undefined && 'type' in data;
}
import { XAccountData } from '../src/types/twitter.js';
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
    userId: 'testuser',
    hits: 1,
    freeUsesLeft: 5
  }),
  deployTokenContract: sinon.stub().resolves({
    success: true,
    data: {
      address: '0x1234567890123456789012345678901234567890',
      name: 'Test Token',
      symbol: 'TEST',
      totalSupply: '100000000000',
      creatorAddress: '0x1234567890123456789012345678901234567890',
      initialPriceUSD: '0.00075'
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
      return {
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
        confirmed: false,
        pendingConfirmation: false,
        success: false,
        reason: 'TIMEOUT',
        tweetId: 'test-tweet-id',
        userId: 'testuser',
        hits: 1,
        freeUsesLeft: 5,
        cached: true,
        paymentRequired: false
      };
    }
    return {
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
      success: confirmed,
      reason: confirmed ? undefined : 'REJECTED',
      tweetId: 'test-tweet-id',
      userId: 'testuser',
      hits: 1,
      freeUsesLeft: 5,
      cached: true,
      paymentRequired: false
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
}

const mockAIService: MockAIService = {
  createAIAgent: sinon.stub().resolves(mockAgent),
  answerQuestion: sinon.stub().resolves('This is a mock answer'),
  analyzePersonality: sinon.stub().resolves({
    success: true,
    data: {
      mbti: 'INTJ',
      traits: ['analytical', 'creative'],
      interests: ['technology', 'AI'],
      values: ['innovation', 'efficiency'],
      communicationStyle: {
        primary: 'direct',
        strengths: ['clarity', 'precision'],
        weaknesses: ['brevity'],
        languages: ['en']
      },
      professionalAptitude: {
        industries: ['tech', 'AI'],
        skills: ['programming', 'analysis'],
        workStyle: 'independent'
      },
      socialInteraction: {
        style: 'professional',
        preferences: ['written communication'],
        challenges: ['small talk']
      },
      contentCreation: {
        topics: ['AI', 'technology'],
        style: 'informative',
        engagement_patterns: ['question-answer']
      },
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.6,
        agreeableness: 0.9,
        neuroticism: 0.3
      },
      writingStyle: {
        formal: 0.8,
        technical: 0.9,
        friendly: 0.6,
        emotional: 0.4
      },
      topicPreferences: ['AI', 'blockchain', 'technology']
    },
    timestamp: new Date().toISOString()
  } as AnalysisResponse<PersonalAnalysisResult>),
  analyzeMatching: sinon.stub().resolves({
    success: true,
    data: {
      compatibility: 0.85,
      commonInterests: ['technology', 'AI'],
      potentialSynergies: ['collaborative development', 'knowledge sharing'],
      challenges: ['communication style differences'],
      recommendations: ['focus on shared interests', 'leverage complementary skills'],
      compatibilityDetails: {
        values: 0.8,
        communication: 0.7,
        interests: 0.9
      },
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.6,
        agreeableness: 0.7,
        neuroticism: 0.4
      },
      writingStyle: {
        formal: 0.7,
        technical: 0.6,
        friendly: 0.8,
        emotional: 0.4
      },
      topicPreferences: ['AI', 'technology'],
      matchScore: 0.85
    }
  }),
  updatePersonality: sinon.stub().resolves(true),
  getAgentById: sinon.stub().resolves(mockAgent),
  getAgentByXAccountId: sinon.stub().resolves(mockAgent),
  generateTokenName: sinon.stub().resolves({
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token for unit tests'
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
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '100000000000',
        creatorAddress: '0x1234567890123456789012345678901234567890',
        initialPriceUSD: '0.00075',
        poolAddress: '0x0987654321098765432109876543210987654321',
        pendingConfirmation: false,
        confirmed: true,
        success: true,
        tweetId: 'test-tweet-id',
        userId: 'testuser',
        hits: 1,
        freeUsesLeft: 5,
        cached: true,
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
    mockAIService.answerQuestion = sinon.stub().resolves('Here is a witty and philosophical answer to your question.');
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
      if (result.data && isMentionResponse(result.data)) {
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
      if (result.data && isMentionResponse(result.data)) {
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
      if (result.data && isMentionResponse(result.data)) {
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
        ...mentionData,
        accountData: {
          ...mentionData.accountData,
          mentionText: '@XAIAgentAI create agent with personality: ' + customPersonality
        }
      }, mockTokenService, mockAIService);

      expect(createResult.success).to.be.true;
      expect(createResult.data).to.exist;
      if (createResult.data && isMentionResponse(createResult.data)) {
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
      expect(result.data?.freeUsesLeft).to.equal(4); // First use should have 4 remaining
    });
  });

  describe('Empty Mention Handling', () => {
    beforeEach(() => {
      sinon.restore();
    });

    it('should handle token name confirmation with 5-minute timeout', async () => {
      const clock = sinon.useFakeTimers();
      try {
        const mentionData = {
          accountData: {
            id: '123456',
            profile: {
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
        if (createResult.data && isMentionResponse(createResult.data)) {
          expect(createResult.data.type).to.equal(MentionType.TOKEN_CREATION);
          expect(createResult.data.pendingConfirmation).to.be.true;
        } else {
          throw new Error('Invalid response type');
        }
        expect(createResult.data.freeUsesLeft).to.equal(5); // Token creation doesn't count against free uses

        // Advance time by 4 minutes (within timeout)
        clock.tick(CONFIRMATION_TIMEOUT - 60 * 1000); // 1 minute before timeout
        const confirmResult = await handleXMention({
          ...mentionData,
          accountData: {
            ...mentionData.accountData,
            mentionText: '@XAIAgentAI confirm'
          }
        }, mockTokenService, mockAIService);
        expect(confirmResult.success).to.be.true;
        expect(confirmResult.data).to.exist;
        if (confirmResult.data && isMentionResponse(confirmResult.data)) {
          expect(confirmResult.data.type).to.equal(MentionType.TOKEN_CREATION);
          expect(confirmResult.data.token).to.exist;
        } else {
          throw new Error('Invalid response type');
        }
        expect(confirmResult.data.freeUsesLeft).to.equal(5); // Token confirmation doesn't count against free uses

        // Try another confirmation after timeout
        clock.tick(2 * 60 * 1000); // Push past CONFIRMATION_TIMEOUT
        const timeoutResult = await handleXMention({
          ...mentionData,
          accountData: {
            ...mentionData.accountData,
            mentionText: '@XAIAgentAI confirm'
          }
        }, mockTokenService, mockAIService);
        expect(timeoutResult.success).to.be.false;
        expect(timeoutResult.error).to.include('confirmation timeout');
      } finally {
        clock.restore();
      }
    });

    it('should return personality analysis for empty mentions', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
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
      if (result.data && isMentionResponse(result.data)) {
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
      const mentionData = {
        accountData: {
          id: '123456',
          profile: {
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

      // Second request should use cached result
      const result2 = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(mockAIService.createAIAgent.callCount).to.equal(1);
      expect(result1.data).to.exist;
      expect(result2.data).to.exist;
      if (result1.data && isMentionResponse(result1.data) && result2.data && isMentionResponse(result2.data)) {
        expect(result2.data.agent).to.deep.equal(result1.data.agent);
      } else {
        throw new Error('Invalid response type');
      }
      expect(result1.data?.freeUsesLeft).to.equal(5); // Empty mentions don't affect free uses
      expect(result2.data?.freeUsesLeft).to.equal(5);
    });
  });
});
