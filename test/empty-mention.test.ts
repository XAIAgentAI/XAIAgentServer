import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

chai.use(chaiAsPromised);
import { handleXMention } from '../src/services/xService.js';
import { 
  MentionType, 
  AIAgent, 
  AnalysisResponse, 
  PersonalAnalysisResult,
  SystemError,
  TokenMetadata,
  AIService,
  Token,
  PersonalityAnalysis,
  MatchingAnalysisResult,
  MentionResponse,
  APIResponse
} from '../src/types/index.js';

// Type guard for MentionResponse
function isMentionResponse(response: APIResponse<MentionResponse>): response is APIResponse<MentionResponse> {
  return Boolean(response.success) && response.data !== undefined && 'type' in response.data;
}
import { XAccountData, Tweet, XProfile, TwitterUser } from '../src/types/twitter.js';

const CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // Match tokenService.ts timeout

describe('Empty mention handling', () => {
  let clock: sinon.SinonFakeTimers;
  let defaultTokenMetadata: TokenMetadata;
  
  // Create a type that matches AIService exactly
  type MockAIServiceType = {
    [K in keyof AIService]: AIService[K] extends (...args: infer P) => infer R
      ? sinon.SinonStub<P, R>
      : AIService[K];
  };

  // Extend the type to include any additional properties needed for testing
  interface MockAIService extends MockAIServiceType {}
  
  interface MockTokenService {
    tokenConfirmations: Map<string, TokenMetadata>;
    CONFIRMATION_TIMEOUT: number;
    createToken: sinon.SinonStub<[TokenMetadata, string], Promise<Token>>;
    validateTokenName: sinon.SinonStub<[string], Promise<boolean>>;
    getTokenByCreator: sinon.SinonStub<[string], Promise<Token | null>>;
    generateTokenMetadata: sinon.SinonStub<[XAccountData], Promise<TokenMetadata>>;
    deployTokenContract: sinon.SinonStub<[TokenMetadata, string], Promise<Token>>;
    transferTokens: sinon.SinonStub<[string, string, string], Promise<void>>;
    renounceOwnership: sinon.SinonStub<[string], Promise<void>>;
    confirmTokenName: sinon.SinonStub<[string, boolean], Promise<TokenMetadata>>;
  }

  let mockAIService: MockAIService;
  let mockTokenService: MockTokenService;
  
  beforeEach(() => {
    clock = sinon.useFakeTimers(new Date().getTime());
    
    // Initialize default token metadata for tests
    defaultTokenMetadata = {
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
      version: 1
    };
    
    const mockAnalyzePersonality = sinon.stub<[XAccountData], Promise<AnalysisResponse<PersonalAnalysisResult>>>();
    mockAnalyzePersonality.resolves({
      success: true,
      data: {
        mbti: 'INTJ',
        traits: ['analytical', 'innovative', 'logical'],
        interests: ['AI', 'blockchain', 'technology'],
        values: ['efficiency', 'innovation', 'knowledge'],
        personalityTraits: {
          openness: 0.8,
          conscientiousness: 0.9,
          extraversion: 0.4,
          agreeableness: 0.7,
          neuroticism: 0.3
        },
        writingStyle: {
          formal: 0.8,
          technical: 0.9,
          friendly: 0.6,
          emotional: 0.4
        },
        topicPreferences: ['AI', 'blockchain', 'technology'],
        communicationStyle: {
          primary: 'direct',
          strengths: ['clarity', 'precision'],
          weaknesses: ['brevity'],
          languages: ['en']
        },
        professionalAptitude: {
          industries: ['technology', 'finance'],
          skills: ['programming', 'analysis'],
          workStyle: 'independent'
        },
        socialInteraction: {
          style: 'professional',
          preferences: ['structured', 'goal-oriented'],
          challenges: ['small talk']
        },
        contentCreation: {
          topics: ['AI', 'blockchain'],
          style: 'technical',
          engagement_patterns: ['educational', 'informative']
        }
      }
    });

    const mockGetAgentByXAccountId = sinon.stub<[string], Promise<AIAgent | null>>();
    mockGetAgentByXAccountId.resolves(null);

    const mockCreateToken = sinon.stub<[TokenMetadata, string], Promise<Token>>();
    mockCreateToken.resolves({
      address: '0x1234567890123456789012345678901234567890',
      name: 'Test Token',
      symbol: 'TEST',
      creatorAddress: '0x1234567890123456789012345678901234567890',
      totalSupply: '1000000000000000000000000000',
      initialPriceUSD: '0.0001',
      poolAddress: '0x0987654321098765432109876543210987654321',
      pendingConfirmation: false
    });
    
    const mockValidateTokenName = sinon.stub<[string], Promise<boolean>>();
    mockValidateTokenName.resolves(true);
    
    const mockGetTokenByCreator = sinon.stub<[string], Promise<Token | null>>();
    mockGetTokenByCreator.resolves(null);

    const mockCreateAIAgent = sinon.stub<Parameters<AIService['createAIAgent']>, ReturnType<AIService['createAIAgent']>>();
    mockCreateAIAgent.resolves({
      id: 'test-agent-1',
      xAccountId: 'test-account-123',
      xHandle: 'testuser',
      personality: {
        mbti: 'INTJ',
        traits: ['analytical', 'innovative', 'logical'],
        interests: ['AI', 'blockchain', 'technology'],
        values: ['efficiency', 'innovation', 'knowledge'],
        communicationStyle: {
          primary: 'direct',
          strengths: ['clarity', 'precision'],
          weaknesses: ['brevity'],
          languages: ['en']
        },
        professionalAptitude: {
          industries: ['technology', 'finance'],
          skills: ['programming', 'analysis'],
          workStyle: 'independent'
        },
        socialInteraction: {
          style: 'professional',
          preferences: ['structured', 'goal-oriented'],
          challenges: ['small talk']
        },
        contentCreation: {
          topics: ['AI', 'blockchain'],
          style: 'technical',
          engagement_patterns: ['educational', 'informative']
        },
        description: 'AI-focused technology professional with analytical mindset',
        lastUpdated: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      lastTrained: new Date().toISOString(),
      trainingHistory: [],
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
    });

    const mockAnswerQuestion = sinon.stub<Parameters<AIService['answerQuestion']>, ReturnType<AIService['answerQuestion']>>();
    mockAnswerQuestion.resolves('Test answer');



    const mockGetAgentById = sinon.stub<Parameters<AIService['getAgentById']>, ReturnType<AIService['getAgentById']>>();
    mockGetAgentById.resolves({
      id: 'test-agent-1',
      xAccountId: 'test-account-123',
      xHandle: 'testuser',
      personality: {
        mbti: 'INTJ',
        traits: ['analytical', 'innovative', 'logical'],
        interests: ['AI', 'blockchain', 'technology'],
        values: ['efficiency', 'innovation', 'knowledge'],
        communicationStyle: {
          primary: 'direct',
          strengths: ['clarity', 'precision'],
          weaknesses: ['brevity'],
          languages: ['en']
        },
        professionalAptitude: {
          industries: ['technology', 'finance'],
          skills: ['programming', 'analysis'],
          workStyle: 'independent'
        },
        socialInteraction: {
          style: 'professional',
          preferences: ['structured', 'goal-oriented'],
          challenges: ['small talk']
        },
        contentCreation: {
          topics: ['AI', 'blockchain'],
          style: 'technical',
          engagement_patterns: ['educational', 'informative']
        },
        description: 'AI-focused technology professional with analytical mindset',
        lastUpdated: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      lastTrained: new Date().toISOString(),
      trainingHistory: [],
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
    });

    const mockAnalyzeMatching = sinon.stub<[XAccountData, XAccountData], Promise<AnalysisResponse<MatchingAnalysisResult>>>();
    mockAnalyzeMatching.resolves({
      success: true,
      data: {
        compatibility: 0.85,
        commonInterests: ['AI', 'blockchain'],
        challenges: ['different time zones'],
        opportunities: ['technology collaboration'],
        writingStyle: {
          formal: 0.8,
          technical: 0.9,
          friendly: 0.6,
          emotional: 0.4
        },
        topicPreferences: ['AI', 'blockchain', 'technology']
      }
    });

    const mockUpdatePersonality = sinon.stub<[string, PersonalityAnalysis], Promise<boolean>>();
    mockUpdatePersonality.resolves(true);

    const mockGenerateTokenName = sinon.stub<Parameters<AIService['generateTokenName']>, ReturnType<AIService['generateTokenName']>>();
    mockGenerateTokenName.resolves({
      name: 'Test Token',
      symbol: 'TEST',
      description: 'Test token for XAIAgent',
      decimals: 18,
      totalSupply: '1000000000000000000000000000',
      initialPrice: '0.0001',
      lockPeriod: 72 * 60 * 60,
      distributionRules: {
        lockedPercentage: 50,
        investorPercentage: 25,
        minimumInvestment: '25000',
        targetFDV: '75000'
      },
      timestamp: new Date().toISOString(),
      version: 1
    });

    const mockGenerateVideoContent = sinon.stub<Parameters<AIService['generateVideoContent']>, ReturnType<AIService['generateVideoContent']>>();
    mockGenerateVideoContent.resolves({
      url: 'https://example.com/video.mp4',
      duration: 60,
      format: 'mp4'
    });

    const mockSearchAndOrganizeContent = sinon.stub<Parameters<AIService['searchAndOrganizeContent']>, ReturnType<AIService['searchAndOrganizeContent']>>();
    mockSearchAndOrganizeContent.resolves({
      results: ['result1', 'result2'],
      categories: ['category1', 'category2']
    });

    mockAIService = {
      analyzePersonality: mockAnalyzePersonality,
      getAgentByXAccountId: mockGetAgentByXAccountId,
      createAIAgent: mockCreateAIAgent,
      answerQuestion: mockAnswerQuestion,
      analyzeMatching: mockAnalyzeMatching,
      updatePersonality: mockUpdatePersonality,
      getAgentById: mockGetAgentById,
      generateTokenName: mockGenerateTokenName,
      generateVideoContent: mockGenerateVideoContent,
      searchAndOrganizeContent: mockSearchAndOrganizeContent
    };
    
    const mockGenerateTokenMetadata = sinon.stub<[XAccountData], Promise<TokenMetadata>>();
    mockGenerateTokenMetadata.resolves({
      name: 'Test Token',
      symbol: 'TEST',
      description: 'Test token for XAIAgent',
      decimals: 18,
      totalSupply: '1000000000000000000000000000',
      initialPrice: '0.0001',
      lockPeriod: 72 * 60 * 60,
      distributionRules: {
        lockedPercentage: 50,
        investorPercentage: 25,
        minimumInvestment: '25000',
        targetFDV: '75000'
      },
      timestamp: new Date().toISOString(),
      version: 1
    });

    const mockDeployTokenContract = sinon.stub<[TokenMetadata, string], Promise<Token>>();
    mockDeployTokenContract.resolves({
      address: '0x1234567890123456789012345678901234567890',
      name: 'Test Token',
      symbol: 'TEST',
      creatorAddress: '0x1234567890123456789012345678901234567890',
      totalSupply: '1000000000000000000000000000',
      initialPriceUSD: '0.0001',
      poolAddress: '0x0987654321098765432109876543210987654321',
      pendingConfirmation: false
    });

    const mockTransferTokens = sinon.stub<[string, string, string], Promise<void>>();
    mockTransferTokens.resolves();

    const mockRenounceOwnership = sinon.stub<[string], Promise<void>>();
    mockRenounceOwnership.resolves();

    const mockConfirmTokenName = sinon.stub<[string, boolean], Promise<TokenMetadata>>();
    mockConfirmTokenName.callsFake(async (tokenName: string, confirmed: boolean) => {
      const now = Date.now();
      const tokenAge = now - new Date(defaultTokenMetadata.timestamp).getTime();
      if (tokenAge > CONFIRMATION_TIMEOUT) {
        return {
          ...defaultTokenMetadata,
          confirmed: false,
          pendingConfirmation: false,
          reason: 'TIMEOUT',
          success: false,
          tweetId: 'test-tweet-id',
          userId: 'testuser',
          hits: 1,
          freeUsesLeft: 5,
          cached: true,
          paymentRequired: false
        };
      }
      return {
        ...defaultTokenMetadata,
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
    });

    mockTokenService = {
      tokenConfirmations: new Map<string, TokenMetadata>(),
      CONFIRMATION_TIMEOUT: 5 * 60 * 1000,
      createToken: mockCreateToken,
      validateTokenName: mockValidateTokenName,
      getTokenByCreator: mockGetTokenByCreator,
      confirmTokenName: mockConfirmTokenName,
      generateTokenMetadata: mockGenerateTokenMetadata,
      deployTokenContract: mockDeployTokenContract,
      transferTokens: mockTransferTokens,
      renounceOwnership: mockRenounceOwnership
    };
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('should return personality analysis for empty mentions', async () => {
    const accountData: XAccountData = {
      id: 'test-account-123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test user profile',
        profileImageUrl: 'https://example.com/avatar.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 1000,
        createdAt: new Date().toISOString(),
        lastTweetAt: new Date().toISOString()
      },
      tweets: [
        {
          id: 'tweet-1',
          text: 'Hello world!',
          createdAt: new Date().toISOString(),
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/avatar.jpg',
            description: 'Test user profile',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://twitter.com/testuser/status/tweet-1',
          tokenCount: 10
        }
      ],
      mentionText: '@XAIAgentAI',
      tweetId: 'mention-tweet-1'
    };
    const mentionData = {
      accountData,
      creatorAddress: '0x1234567890123456789012345678901234567890'
    };

    const result = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(result.success).to.be.true;
    expect(result.data).to.exist;
    if (isMentionResponse(result)) {
      const data = result.data as MentionResponse;
      expect(data.type).to.equal(MentionType.EMPTY);
    } else {
      throw new Error('Invalid response type');
    }
    expect(mockAIService.analyzePersonality.calledOnce).to.be.true;
  });

  it('should allow unlimited empty mentions', async () => {
    const accountData: XAccountData = {
      id: 'test-account-123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test user profile',
        profileImageUrl: 'https://example.com/avatar.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 1000,
        createdAt: new Date().toISOString(),
        lastTweetAt: new Date().toISOString()
      },
      tweets: [
        {
          id: 'tweet-1',
          text: 'Hello world!',
          createdAt: new Date().toISOString(),
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/avatar.jpg',
            description: 'Test user profile',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://twitter.com/testuser/status/tweet-1',
          tokenCount: 10
        }
      ],
      mentionText: '@XAIAgentAI',
      tweetId: 'mention-tweet-1'
    };
    const mentionData = {
      accountData,
      creatorAddress: '0x1234567890123456789012345678901234567890'
    };

    // Make multiple requests to verify unlimited empty mentions
    const results = [];
    for (let i = 0; i < 51; i++) {
      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      results.push(result);
      expect(result.success).to.be.true;
    }
  });

  it('should cache personality analysis results', async () => {
    const accountData: XAccountData = {
      id: 'test-account-123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test user profile',
        profileImageUrl: 'https://example.com/avatar.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 1000,
        createdAt: new Date().toISOString(),
        lastTweetAt: new Date().toISOString()
      },
      tweets: [
        {
          id: 'tweet-1',
          text: 'Hello world!',
          createdAt: new Date().toISOString(),
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/avatar.jpg',
            description: 'Test user profile',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://twitter.com/testuser/status/tweet-1',
          tokenCount: 10
        }
      ],
      mentionText: '@XAIAgentAI',
      tweetId: 'mention-tweet-1'
    };
    const mentionData = {
      accountData,
      creatorAddress: '0x1234567890123456789012345678901234567890'
    };

    // First request should call analyzePersonality
    const firstResult = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(mockAIService.analyzePersonality.callCount).to.equal(1);
    expect(firstResult.success).to.be.true;
    expect(firstResult.data).to.exist;
    if (isMentionResponse(firstResult)) {
      const data = firstResult.data as MentionResponse;
      expect(data.type).to.equal(MentionType.EMPTY);
      expect(data.analysis).to.exist;

      // Second request within cache period should not call analyzePersonality
      const secondResult = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(mockAIService.analyzePersonality.callCount).to.equal(1);
      expect(secondResult.success).to.be.true;
      expect(secondResult.data).to.exist;
      if (isMentionResponse(secondResult)) {
        const data = secondResult.data as MentionResponse;
        expect(data.type).to.equal(MentionType.EMPTY);
        expect(data.analysis).to.exist;
      } else {
        throw new Error('Invalid response type');
      }
    } else {
      throw new Error('Invalid response type');
    }
    expect(firstResult.success).to.be.true;
    expect(firstResult.data).to.exist;
    expect(firstResult.data?.freeUsesLeft).to.equal(5); // Empty mentions don't count against free uses

    // Second request within cache period should not call analyzePersonality
    const secondResult = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(secondResult.success).to.be.true;
    expect(secondResult.data).to.exist;
    expect(secondResult.data?.freeUsesLeft).to.equal(5); // Empty mentions don't count against free uses

    // Advance time past cache expiration
    clock.tick(24 * 60 * 60 * 1000); // 24 hours

    // Request after cache expiration should call analyzePersonality again
    await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(mockAIService.analyzePersonality.callCount).to.equal(2);
  });

  it('should handle token name confirmation with timeout', async () => {
    const accountData: XAccountData = {
      id: 'test-account-123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test user profile',
        profileImageUrl: 'https://example.com/avatar.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 1000,
        createdAt: new Date().toISOString(),
        lastTweetAt: new Date().toISOString()
      },
      tweets: [
        {
          id: 'tweet-1',
          text: 'Hello world!',
          createdAt: new Date().toISOString(),
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/avatar.jpg',
            description: 'Test user profile',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://twitter.com/testuser/status/tweet-1',
          tokenCount: 10
        }
      ],
      mentionText: '@XAIAgentAI create token',
      tweetId: 'mention-tweet-1'
    };

    const mentionData = {
      accountData,
      creatorAddress: '0x1234567890123456789012345678901234567890'
    };

    // First request should trigger token name suggestion
    const result = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(result.success).to.be.true;
    expect(result.success).to.be.true;
    expect(result.data).to.exist;
    if (isMentionResponse(result)) {
      const data = result.data as MentionResponse;
      expect(data.type).to.equal(MentionType.TOKEN_CREATION);
      expect(data.token).to.exist;
      expect(data.token?.pendingConfirmation).to.be.true;
    } else {
      throw new Error('Invalid response type');
    }
    expect(result.success).to.be.true;
    expect(result.data).to.exist;
    expect(result.data?.freeUsesLeft).to.equal(5); // Token operations don't count against free uses

    // Advance time but stay within confirmation timeout
    clock.tick(CONFIRMATION_TIMEOUT - 1000);

    // Confirm token name
    const confirmResult = await handleXMention({
      accountData: {
        ...accountData,
        mentionText: '@XAIAgentAI yes'
      },
      creatorAddress: mentionData.creatorAddress
    }, mockTokenService, mockAIService);
    expect(confirmResult.success).to.be.true;
    expect(confirmResult.success).to.be.true;
    expect(confirmResult.data).to.exist;
    if (isMentionResponse(confirmResult)) {
      const data = confirmResult.data as MentionResponse;
      expect(data.type).to.equal(MentionType.TOKEN_CREATION);
      expect(data.token).to.exist;
      expect(data.token?.pendingConfirmation).to.be.false;
    } else {
      throw new Error('Invalid response type');
    }
    expect(confirmResult.success).to.be.true;
    expect(confirmResult.data).to.exist;
    expect(confirmResult.data?.freeUsesLeft).to.equal(5); // Token operations don't count against free uses

    // Advance time past confirmation timeout
    clock.tick(CONFIRMATION_TIMEOUT + 1);

    // Try confirming after timeout
    const timeoutResult = await handleXMention({
      accountData: {
        ...accountData,
        mentionText: '@XAIAgentAI yes'
      },
      creatorAddress: mentionData.creatorAddress
    }, mockTokenService, mockAIService);
    expect(timeoutResult.success).to.be.false;
    expect(timeoutResult.error).to.equal('TOKEN_CONFIRMATION_TIMEOUT');
    expect(mockTokenService.confirmTokenName.called).to.be.true;
    expect(timeoutResult.data).to.exist;
    expect(timeoutResult.data?.freeUsesLeft).to.equal(5); // Token operations don't count against free uses
    const lastCallResult = await mockTokenService.confirmTokenName.lastCall.returnValue;
    expect(lastCallResult.success).to.be.false;
    expect(lastCallResult.confirmed).to.be.false;
    expect(lastCallResult.reason).to.equal('TIMEOUT');
  });
});
