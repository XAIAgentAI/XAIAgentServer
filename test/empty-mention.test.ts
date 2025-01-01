import chai from 'chai';
const { expect } = chai;
import chaiAsPromised from 'chai-as-promised';
import sinon, { SinonFakeTimers, SinonStub } from 'sinon';
import { MentionType } from '../src/types/index.js';
import type { 
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
  APIResponse, 
  ServiceResponse 
} from '../src/types/index.js';

import * as tokenServiceModule from '../src/services/tokenService.js';
import { handleXMention } from '../src/services/xService.js';
import { XAccountData } from '../src/types/twitter.js';

// Create type for token service
type TokenService = typeof tokenServiceModule;

// Type guard for MentionResponse
function isMentionResponse(response: APIResponse<MentionResponse>): response is APIResponse<MentionResponse> & { data: MentionResponse } {
  return Boolean(response.success) && response.data !== undefined && 'type' in response.data;
}

// Default token metadata for tests
const defaultTokenMetadata: TokenMetadata = {
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

const CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // Match tokenService.ts timeout

// Mock services and stubs
let clock: SinonFakeTimers;
let tokenService: TokenService;
let createTokenStub: SinonStub<[TokenMetadata, string], Promise<Token>>;
let confirmTokenNameStub: SinonStub<[string, boolean], Promise<TokenMetadata>>;
let getTokenByCreatorStub: SinonStub<[string], Promise<Token | null>>;
let mockAIService: AIService;
let mockGetAgentByXAccountId: SinonStub<[string], Promise<AIAgent | null>>;
let mockCreateAIAgent: SinonStub<[XAccountData], Promise<AIAgent>>;
let mockAnswerQuestion: SinonStub<[string, AIAgent], Promise<string>>;
let mockGenerateTokenName: SinonStub<[XAccountData], Promise<TokenMetadata>>;
let mockGenerateVideoContent: SinonStub<[string, AIAgent], Promise<{ url: string; duration: number; format: string; }>>;
let mockSearchAndOrganizeContent: SinonStub<[string, AIAgent], Promise<{ results: string[]; categories: string[]; }>>;
let mockAnalyzeMatching: SinonStub<[XAccountData, XAccountData], Promise<AnalysisResponse<MatchingAnalysisResult>>>;
let mockAnalyzePersonality: SinonStub<[XAccountData, boolean?], Promise<AnalysisResponse<PersonalAnalysisResult>>> & {
  calledOnce: boolean;
  callCount: number;
  resetHistory: () => void;
};

describe('Empty mention handling', () => {

  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers();
    
    // Initialize stubs for token service functions
    createTokenStub = sinon.stub<[TokenMetadata, string], Promise<Token>>().resolves({
      address: '0x1234567890123456789012345678901234567890',
      name: defaultTokenMetadata.name,
      symbol: defaultTokenMetadata.symbol,
      creatorAddress: '0x1234567890123456789012345678901234567890',
      totalSupply: defaultTokenMetadata.totalSupply,
      initialPriceUSD: defaultTokenMetadata.initialPrice,
      pendingConfirmation: true
    });
    confirmTokenNameStub = sinon.stub<[string, boolean], Promise<TokenMetadata>>().resolves({ 
      ...defaultTokenMetadata,
      confirmed: true 
    });
    getTokenByCreatorStub = sinon.stub<[string], Promise<Token | null>>().resolves(null);

    // Create token service instance with stubs
    tokenService = {
      ...tokenServiceModule,
      createToken: createTokenStub,
      confirmTokenName: confirmTokenNameStub,
      getTokenByCreator: getTokenByCreatorStub,
      tokenConfirmations: new Map(),
      CONFIRMATION_TIMEOUT: 5 * 60 * 1000
    };

    // Token service instance is already initialized with stubs
    
    // Initialize mock AI service stubs
    mockGetAgentByXAccountId = sinon.stub();
    mockCreateAIAgent = sinon.stub();
    mockAnswerQuestion = sinon.stub();
    mockGenerateTokenName = sinon.stub();
    mockGenerateVideoContent = sinon.stub();
    mockSearchAndOrganizeContent = sinon.stub();
    mockAnalyzeMatching = sinon.stub();
    const stub = sinon.stub<[XAccountData, boolean?], Promise<AnalysisResponse<PersonalAnalysisResult>>>().callsFake(async () => ({
      success: true,
      data: {
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
        interests: ['AI', 'technology'],
        topicPreferences: ['AI', 'blockchain', 'technology']
      },
      hits: 1,
      freeUsesLeft: 5,
      cached: false,
      paymentRequired: false
    }));
    
    mockAnalyzePersonality = Object.assign(stub, {
      calledOnce: false,
      callCount: 0,
      resetHistory: () => {
        mockAnalyzePersonality.calledOnce = false;
        mockAnalyzePersonality.callCount = 0;
      }
    });

    // Initialize mockAIService with all required methods
    mockAIService = {
      analyzePersonality: mockAnalyzePersonality,
      getAgentByXAccountId: mockGetAgentByXAccountId,
      createAIAgent: mockCreateAIAgent,
      answerQuestion: mockAnswerQuestion,
      analyzeMatching: mockAnalyzeMatching,
      generateTokenName: mockGenerateTokenName,
      generateVideoContent: mockGenerateVideoContent,
      searchAndOrganizeContent: mockSearchAndOrganizeContent,
      verifyModelAvailability: sinon.stub().resolves({ 
        success: true, 
        data: { 
          modelAvailable: true, 
          modelId: 'test-model' 
        } 
      }),
      updatePersonality: sinon.stub().resolves(true),
      getAgentById: sinon.stub().resolves(null)
    };
  });

  it('should handle token name confirmation with timeout', async () => {
    const accountData: XAccountData = {
      id: 'test-account-123',
      profile: {
        id: 'test-profile-4',
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
    const result = await handleXMention(mentionData, tokenService, mockAIService);
    expect(result.success).to.be.true;
    expect(result.data).to.exist;
    if (isMentionResponse(result)) {
      const data = result.data as MentionResponse;
      expect(data.type).to.equal(MentionType.TOKEN_CREATION);
      expect(data.token).to.exist;
      expect(data.token?.pendingConfirmation).to.be.true;
      expect(data.freeUsesLeft).to.equal(5); // Token operations don't count against free uses
    } else {
      throw new Error('Invalid response type');
    }

    // Advance time past confirmation timeout and wait for events to process
    clock.tick(CONFIRMATION_TIMEOUT + 1000);
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow event loop to process timeouts

    // Attempt to confirm token name after timeout
    const confirmResult = await handleXMention({
      accountData: {
        ...accountData,
        mentionText: '@XAIAgentAI yes'
      },
      creatorAddress: mentionData.creatorAddress
    }, tokenService, mockAIService);
    
    // Should fail due to timeout
    expect(confirmResult.success).to.be.false;
    expect(confirmResult.error).to.equal('TOKEN_CONFIRMATION_TIMEOUT');
    expect(confirmResult.message).to.equal('Token confirmation timed out. Please try again.');
    expect(tokenService.tokenConfirmations.get(accountData.id)).to.be.undefined; // Verify cleanup happened

    // Advance time past confirmation timeout and wait for events to process
    clock.tick(CONFIRMATION_TIMEOUT + 1);
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow event loop to process timeouts

    // Try confirming after timeout
    const timeoutResult = await handleXMention({
      accountData: {
        ...accountData,
        mentionText: '@XAIAgentAI yes'
      },
      creatorAddress: mentionData.creatorAddress
    }, tokenService, mockAIService);
    expect(timeoutResult.success).to.be.false;
    expect(timeoutResult.error).to.equal('TOKEN_CONFIRMATION_TIMEOUT');
    expect(timeoutResult.message).to.equal('Token confirmation timed out. Please try again.');
    expect(tokenService.tokenConfirmations.get(accountData.id)).to.be.undefined; // Verify cleanup happened
    expect(confirmTokenNameStub.called).to.be.false; // Should not call confirmTokenName after timeout
    expect(timeoutResult.data).to.exist;
    expect(timeoutResult.data?.freeUsesLeft).to.equal(5); // Token operations don't count against free uses
    expect(timeoutResult.data?.cached).to.be.true;
    
    // Clean up clock
    if (clock) {
      clock.restore();
    }
  });
});
