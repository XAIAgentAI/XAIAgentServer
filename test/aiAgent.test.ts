import { expect } from 'chai';
import sinon from 'sinon';

// Helper function for array comparison
const sortArrays = (obj: any) => {
  if (Array.isArray(obj)) {
    return obj.sort();
  }
  if (typeof obj === 'object' && obj !== null) {
    Object.keys(obj).forEach(key => {
      if (Array.isArray(obj[key])) {
        obj[key] = obj[key].sort();
      }
    });
  }
  return obj;
};

// Define module types
interface AIAgentService {
  analyzePersonality: (data: XAccountData) => Promise<AnalysisResponse>;
  analyzeMatching: (data1: XAccountData, data2: XAccountData) => Promise<AnalysisResponse>;
}

interface PaymentService {
  validateAndProcessPayment: (userId: string, amount: number) => Promise<{
    success: boolean;
    error?: string;
    requiresApproval?: boolean;
  }>;
}

interface UserAnalyticsService {
  getOrCreateUserAnalytics: (userId: string) => Promise<UserAnalytics>;
  recordAnalysis: (userId: string, type: string, targetUserId?: string) => Promise<{
    success: boolean;
    paymentRequired: boolean;
    freeUsesLeft: number;
  }>;
}

interface AnalysisCacheService {
  getCachedAnalysis: (userId: string, type: string) => Promise<CacheResponse<PersonalAnalysisResult>>;
}

// Declare module variables with type assertions
let aiAgentServiceModule: any;
let paymentServiceModule: any;
let userAnalyticsServiceModule: any;
let analysisCacheServiceModule: any;
let decentralGPTStub: sinon.SinonStub;

// Import types

import { 
  PersonalAnalysisResult, 
  MatchingAnalysisResult, 
  UserAnalytics, 
  AnalysisResponse,
  CacheResponse
} from '../src/types/index.js';
import { XAccountData } from '../src/types/twitter.js';

describe('AI Agent Analysis Tests', () => {
  // Create sandbox and stubs for all services
  let sandbox: sinon.SinonSandbox;
  let analyzePersonalityStub: sinon.SinonStub;
  let analyzeMatchingStub: sinon.SinonStub;
  let getCachedAnalysisStub: sinon.SinonStub;
  let getOrCreateUserAnalyticsStub: sinon.SinonStub;
  let recordAnalysisStub: sinon.SinonStub;
  let validateAndProcessPaymentStub: sinon.SinonStub;
  
  beforeEach(async () => {
    // Initialize sandbox and stubs
    sandbox = sinon.createSandbox();
    
    // Create stub functions
    analyzePersonalityStub = sandbox.stub();
    analyzeMatchingStub = sandbox.stub();
    getCachedAnalysisStub = sandbox.stub();
    getOrCreateUserAnalyticsStub = sandbox.stub();
    recordAnalysisStub = sandbox.stub();
    validateAndProcessPaymentStub = sandbox.stub();
    
    // Import the service module
    aiAgentServiceModule = await import('../src/services/aiAgentService.js');
    
    // Create mock services with proper return types
    const mockUserAnalyticsService = {
      recordAnalysis: recordAnalysisStub,
      getOrCreateUserAnalytics: getOrCreateUserAnalyticsStub.resolves({ 
        userId: 'user123',
        freeMatchingUsesLeft: 5,
        totalMatchingAnalyses: 0,
        lastAnalysisDate: new Date().toISOString(),
        analysisHistory: []
      }),
      recordSuccessfulPayment: sandbox.stub().resolves(true)
    };
    
    const mockPaymentService = {
      validateAndProcessPayment: validateAndProcessPaymentStub.resolves({ success: true, paymentRequired: false }),
      checkXAABalance: sandbox.stub().resolves({ success: true, balance: BigInt(1000) }),
      processXAAPayment: sandbox.stub().resolves({ success: true }),
      getXAAApprovalStatus: sandbox.stub().resolves({ success: true, approved: true })
    };

    const mockAnalysisCacheService = {
      getCachedAnalysis: getCachedAnalysisStub,
      cacheAnalysis: sandbox.stub().resolves(true)
    };

    // Mock DecentralGPT API calls
    decentralGPTStub = sandbox.stub();
    decentralGPTStub.callsFake((prompt: string, context: string) => {
      if (prompt.includes('personality profile') || prompt.includes('detailed personality')) {
        return Promise.resolve(JSON.stringify({
          traits: {
            openness: 0.8,
            conscientiousness: 0.7,
            extraversion: 0.6,
            agreeableness: 0.7,
            neuroticism: 0.4
          },
          interests: ['technology', 'AI'],
          style: {
            formal: 0.7,
            technical: 0.6,
            friendly: 0.8,
            emotional: 0.4
          },
          topics: ['AI', 'Technology']
        }));
      } else if (prompt.includes('compatibility report')) {
        return Promise.resolve(JSON.stringify({
          matchScore: 0.85,
          commonInterests: ['tech', 'AI'],
          compatibility: 0.85,
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
            formal: 0.6,
            technical: 0.7,
            friendly: 0.8,
            emotional: 0.4
          },
          topicPreferences: ['AI', 'technology']
        }));
      }
      return Promise.resolve('{}');
    });

    // Inject mock DecentralGPT client
    aiAgentServiceModule.injectDependencies({
      decentralGPTClient: {
        call: decentralGPTStub
      }
    });

    // Inject mock services
    aiAgentServiceModule.injectDependencies({
      userAnalyticsService: mockUserAnalyticsService,
      paymentService: mockPaymentService,
      analysisCacheService: mockAnalysisCacheService
    });

    // Store references for test assertions
    userAnalyticsServiceModule = mockUserAnalyticsService;
    paymentServiceModule = mockPaymentService;
    analysisCacheServiceModule = mockAnalysisCacheService;
  });

  afterEach(() => {
    // Restore sandbox
    sandbox.restore();
  });

  describe('Personal Analysis', () => {
    const mockXAccountData: XAccountData = {
      id: 'user123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test bio',
        profileImageUrl: 'https://example.com/profile.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 200,
        createdAt: '2024-02-25T00:00:00Z',
        lastTweetAt: '2024-02-25T00:00:00Z'
      },
      tweets: [
        {
          id: 'tweet1',
          text: 'Test tweet 1',
          createdAt: '2024-02-25T00:00:00Z',
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/profile.jpg',
            description: 'Test bio',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://x.com/testuser/status/tweet1'
        }
      ]
    };

    it('should analyze personal X account for free', async () => {
      const mockAnalysisResult = {
        success: true,
        paymentRequired: false,
        data: {
          personalityTraits: { 
            openness: 0.8, 
            conscientiousness: 0.7,
            extraversion: 0.6,
            agreeableness: 0.7,
            neuroticism: 0.4
          },
          interests: ['technology', 'AI'],
          writingStyle: { 
            formal: 0.7,
            technical: 0.6,
            friendly: 0.8,
            emotional: 0.4
          },
          topicPreferences: ['AI']
        }
      };

      recordAnalysisStub.resolves({ success: true, paymentRequired: false, freeUsesLeft: 5 });
      getCachedAnalysisStub.resolves({ success: false, cached: false });
      decentralGPTStub.resolves(JSON.stringify({
        traits: mockAnalysisResult.data.personalityTraits,
        interests: mockAnalysisResult.data.interests,
        style: mockAnalysisResult.data.writingStyle,
        topics: mockAnalysisResult.data.topicPreferences
      }));
      
      // Cache analysis is already mocked in service setup

      const result = await aiAgentServiceModule.analyzePersonality(mockXAccountData);
      expect(result).to.not.be.null;
      expect(sortArrays(result.data)).to.deep.equal(sortArrays(mockAnalysisResult.data));
      expect(recordAnalysisStub.calledOnce).to.be.true;
      expect(validateAndProcessPaymentStub.called).to.be.false;
    });

    it('should use cache if available', async () => {
      const mockCachedResult = {
        success: true,
        paymentRequired: false,
        data: {
          personalityTraits: { 
            openness: 0.8, 
            conscientiousness: 0.7,
            extraversion: 0.6,
            agreeableness: 0.7,
            neuroticism: 0.4
          },
          interests: ['technology', 'AI'],
          writingStyle: { 
            formal: 0.7,
            technical: 0.6,
            friendly: 0.8,
            emotional: 0.4
          },
          topicPreferences: ['AI']
        }
      };

      recordAnalysisStub.resolves({ success: true, paymentRequired: false, freeUsesLeft: 5 });
      getCachedAnalysisStub.resolves({ success: true, data: mockCachedResult.data, cached: true });
      const result = await aiAgentServiceModule.analyzePersonality(mockXAccountData);
      expect(result).to.not.be.null;
      expect(sortArrays(result.data)).to.deep.equal(sortArrays(mockCachedResult.data));
      expect(getCachedAnalysisStub.calledOnce).to.be.true;
    });
  });

  describe('Matching Analysis', () => {
    const mockXAccountData: XAccountData = {
      id: 'user123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test bio',
        profileImageUrl: 'https://example.com/profile.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 200,
        createdAt: '2024-02-25T00:00:00Z',
        lastTweetAt: '2024-02-25T00:00:00Z'
      },
      tweets: [
        {
          id: 'tweet1',
          text: 'Test tweet 1',
          createdAt: '2024-02-25T00:00:00Z',
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/profile.jpg',
            description: 'Test bio',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://x.com/testuser/status/tweet1'
        }
      ]
    };

    it('should use free credit if available', async () => {
      const mockAnalytics: UserAnalytics = {
        userId: 'user123',
        freeMatchingUsesLeft: 5,
        totalMatchingAnalyses: 0,
        lastAnalysisDate: new Date().toISOString(),
        analysisHistory: []
      };

      recordAnalysisStub.withArgs('user123', 'matching', 'user123').resolves({ 
        success: true, 
        paymentRequired: false, 
        freeUsesLeft: 4 
      });

      const mockMatchingData = {
        compatibility: 0.85,
        commonInterests: ['tech'],
        challenges: ['communication style differences'],
        opportunities: ['leverage complementary skills'],
        writingStyle: {
          formal: 0.7,
          technical: 0.6,
          friendly: 0.8,
          emotional: 0.4
        },
        topicPreferences: ['AI', 'Technology']
      };

      const mockMatchingResult = {
        success: true,
        paymentRequired: false,
        freeUsesLeft: 4,
        data: mockMatchingData,
        cached: false,
        hits: 1
      };

      getOrCreateUserAnalyticsStub.resolves(mockAnalytics);
      recordAnalysisStub.resolves({ success: true, paymentRequired: false, freeUsesLeft: 4 });
      validateAndProcessPaymentStub.resolves({ success: true });
      
      // Set up stub for matching analysis
      decentralGPTStub.resolves(JSON.stringify({
        matchScore: 0.85,
        commonInterests: ['tech'],
        compatibility: {
          values: 0.8,
          communication: 0.7,
          interests: 0.9
        }
      }));

      const expectedResult = mockMatchingResult;

      const result = await aiAgentServiceModule.analyzeMatching(mockXAccountData, mockXAccountData);
      expect(result).to.deep.equal(expectedResult);
      expect(recordAnalysisStub.calledOnce).to.be.true;
      expect(validateAndProcessPaymentStub.called).to.be.false;
    });

    it('should require XAA token if no free credits left', async () => {
      const mockAnalytics: UserAnalytics = {
        userId: 'user123',
        freeMatchingUsesLeft: 0,
        totalMatchingAnalyses: 5,
        lastAnalysisDate: new Date().toISOString(),
        analysisHistory: []
      };

      const mockMatchingData = {
        compatibility: 0.85,
        commonInterests: ['tech'],
        challenges: ['communication style differences'],
        opportunities: ['leverage complementary skills'],
        writingStyle: {
          formal: 0.7,
          technical: 0.6,
          friendly: 0.8,
          emotional: 0.4
        },
        topicPreferences: ['AI', 'Technology']
      };

      const mockMatchingResult = {
        success: true,
        paymentRequired: true,
        freeUsesLeft: 0,
        data: mockMatchingData,
        cached: false,
        hits: 1
      };

      getOrCreateUserAnalyticsStub.resolves(mockAnalytics);
      recordAnalysisStub.withArgs('user123', 'matching', 'user123').resolves({ 
        success: true, 
        paymentRequired: true, 
        freeUsesLeft: 0 
      });
      validateAndProcessPaymentStub.resolves({ success: true });
      
      const result = await aiAgentServiceModule.analyzeMatching(mockXAccountData, mockXAccountData);
      expect(result).to.not.be.null;
      expect(result).to.deep.equal(mockMatchingResult);
      expect(recordAnalysisStub.calledOnce).to.be.true;
      expect(validateAndProcessPaymentStub.calledOnce).to.be.true;
    });

    it('should fail if XAA payment not possible', async () => {
      const mockAnalytics: UserAnalytics = {
        userId: 'user123',
        freeMatchingUsesLeft: 0,
        totalMatchingAnalyses: 5,
        lastAnalysisDate: new Date().toISOString(),
        analysisHistory: []
      };

      getOrCreateUserAnalyticsStub.resolves(mockAnalytics);
      recordAnalysisStub.withArgs('user123', 'matching', 'user123').resolves({ 
        success: false, 
        paymentRequired: true, 
        freeUsesLeft: 0 
      });
      validateAndProcessPaymentStub.resolves({ success: false, error: 'INSUFFICIENT_BALANCE', requiresApproval: false });
      
      const result = await aiAgentServiceModule.analyzeMatching(mockXAccountData, mockXAccountData);
      expect(result).to.not.be.null;
      expect(result.success).to.be.false;
      expect(result.paymentRequired).to.be.true;
      expect(result.error).to.equal('INSUFFICIENT_BALANCE');
      expect(getOrCreateUserAnalyticsStub.calledOnce).to.be.true;
      expect(recordAnalysisStub.calledOnce).to.be.true;
      expect(validateAndProcessPaymentStub.calledOnce).to.be.true;
    });
  });

  describe('DecentralGPT Model Verification', () => {
    // Create a mock X account data for testing
    const testXAccountData: XAccountData = {
      id: 'test123',
      profile: {
        username: 'testuser',
        name: 'Test User',
        description: 'Test bio',
        profileImageUrl: 'https://example.com/profile.jpg',
        followersCount: 100,
        followingCount: 50,
        tweetCount: 200,
        createdAt: '2024-02-25T00:00:00Z',
        lastTweetAt: '2024-02-25T00:00:00Z'
      },
      tweets: [
        {
          id: 'tweet1',
          text: 'Test tweet 1',
          createdAt: '2024-02-25T00:00:00Z',
          user: {
            screenName: 'testuser',
            name: 'Test User',
            profileImageUrl: 'https://example.com/profile.jpg',
            description: 'Test bio',
            followersCount: 100,
            friendsCount: 50,
            location: 'Test Location'
          },
          images: [],
          videos: [],
          url: 'https://x.com/testuser/status/tweet1'
        }
      ]
    };

    it('should verify model availability before making API calls', async () => {
      const mockModels = ['Llama3.3-70B', 'GPT-4'];
      const fetchModelsStub = sandbox.stub(aiAgentServiceModule, 'fetchAvailableModels');
      fetchModelsStub.resolves(mockModels);
      
      // Inject the DecentralGPT client stub
      aiAgentServiceModule.injectDependencies({
        decentralGPTClient: {
          call: async (prompt: string, context: string) => {
            return JSON.stringify({
              traits: { openness: 0.8 },
              interests: ['AI'],
              style: { formal: 0.7 }
            });
          }
        }
      });

      const result = await aiAgentServiceModule.analyzePersonality(testXAccountData);
      expect(result).to.not.be.null;
      expect(result.success).to.be.true;
      expect(fetchModelsStub.calledOnce).to.be.true;
    });

    it('should fall back to available model if preferred model is not available', async () => {
      const mockModels = ['GPT-4'];  // Llama3.3-70B not available
      const fetchModelsStub = sandbox.stub(aiAgentServiceModule, 'fetchAvailableModels');
      fetchModelsStub.resolves(mockModels);
      
      // Inject the DecentralGPT client stub
      aiAgentServiceModule.injectDependencies({
        decentralGPTClient: {
          call: async (prompt: string, context: string) => {
            return JSON.stringify({
              traits: { openness: 0.8 },
              interests: ['AI'],
              style: { formal: 0.7 }
            });
          }
        }
      });

      const result = await aiAgentServiceModule.analyzePersonality(testXAccountData);
      expect(result).to.not.be.null;
      expect(result.success).to.be.true;
      expect(fetchModelsStub.calledOnce).to.be.true;
    });
  });
});
