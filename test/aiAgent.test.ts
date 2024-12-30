import { expect } from 'chai';
import sinon, { SinonStub } from 'sinon';
import { createTestClient } from '../src/services/decentralGPTClient.js';

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
let mockClient: any;

// Import types

import { 
  PersonalAnalysisResult, 
  MatchingAnalysisResult, 
  UserAnalytics, 
  AnalysisResponse,
  CacheResponse,
  ServiceResponse
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
    // Set test environment and initialize sandbox
    process.env.NODE_ENV = 'test';
    sandbox = sinon.createSandbox();
    
    // Configure mock client for all tests
    mockClient = {
      fetchAvailableModels: sandbox.stub().resolves(['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai']),
      verifyModelAvailability: sandbox.stub().callsFake(async (modelId?: string) => {
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
        const isAvailable = models.some(m => 
          m.toLowerCase().trim() === normalizedModelId || 
          (normalizedModelId.startsWith('llama-3.3') && m.toLowerCase().trim().startsWith('llama-3.3'))
        );

        return {
          success: true,
          data: {
            modelAvailable: isAvailable,
            modelId: isAvailable ? modelId : defaultModel,
            availableModels: models
          }
        };
      }),
      call: sandbox.stub().resolves({
        success: true,
        data: {
          cached: false,
          hits: 1,
          freeUsesLeft: 5,
          paymentRequired: false,
          personality: {
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
        }
      })
    };
    
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

    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Inject mock DecentralGPT client with test mode
    aiAgentServiceModule.injectDependencies({
      decentralGPTClient: mockClient,
      testMode: true
    });

    mockClient.call.callsFake((prompt: string, context: string) => {
      if (prompt.includes('personality profile') || prompt.includes('detailed personality')) {
        return Promise.resolve(JSON.stringify({
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
          topicPreferences: ['AI', 'Technology']
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
    
    // Client already injected in beforeEach

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
        id: 'profile123',
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
      mockClient.call.resolves(JSON.stringify({
        personalityTraits: mockAnalysisResult.data.personalityTraits,
        interests: mockAnalysisResult.data.interests,
        writingStyle: mockAnalysisResult.data.writingStyle,
        topicPreferences: mockAnalysisResult.data.topicPreferences
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
        id: 'profile456',
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
        challenges: ['different communication styles'],
        opportunities: ['leverage complementary skills'],
        compatibilityDetails: {
          values: 0.8,
          communication: 0.7,
          interests: 0.9
        },
        matchScore: 0.85,
        personalityTraits: {},
        potentialSynergies: [
          'Technical collaboration',
          'Knowledge sharing'
        ],
        recommendations: [
          'Schedule regular sync-ups',
          'Focus on shared interests'
        ],
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
      mockClient.call.resolves(JSON.stringify({
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
        challenges: ['different communication styles'],
        opportunities: ['leverage complementary skills'],
        compatibilityDetails: {
          values: 0.8,
          communication: 0.7,
          interests: 0.9
        },
        matchScore: 0.85,
        personalityTraits: {},
        potentialSynergies: [
          'Technical collaboration',
          'Knowledge sharing'
        ],
        recommendations: [
          'Schedule regular sync-ups',
          'Focus on shared interests'
        ],
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
      // Compare specific fields
      expect(result.success).to.equal(mockMatchingResult.success);
      expect(result.paymentRequired).to.equal(mockMatchingResult.paymentRequired);
      expect(result.freeUsesLeft).to.equal(mockMatchingResult.freeUsesLeft);
      expect(result.cached).to.equal(mockMatchingResult.cached);
      expect(result.hits).to.equal(mockMatchingResult.hits);
      expect(sortArrays(result.data)).to.deep.equal(sortArrays(mockMatchingResult.data));
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
    let mockClient: any;
    let mockUserAnalyticsService: any;
    let mockPaymentService: any;
    let mockAnalysisCacheService: any;
    let testXAccountData: XAccountData;

    beforeEach(() => {
      // Reset sandbox and create fresh mocks for each test
      sandbox.restore();
      
      testXAccountData = {
        id: 'test123',
        profile: {
          id: 'profile789',
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

      // Create fresh mock services
      mockUserAnalyticsService = {
        getOrCreateUserAnalytics: sandbox.stub().resolves({
          userId: 'test123',
          freeMatchingUsesLeft: 5,
          totalMatchingAnalyses: 0,
          lastAnalysisDate: new Date().toISOString(),
          analysisHistory: []
        }),
        recordAnalysis: sandbox.stub().resolves({
          success: true,
          paymentRequired: false,
          freeUsesLeft: 4
        }),
        updateUserAnalytics: sandbox.stub().resolves(true)
      };

      mockPaymentService = {
        validateAndProcessPayment: sandbox.stub().resolves({ success: true })
      };

      mockAnalysisCacheService = {
        getCachedAnalysis: sandbox.stub().resolves({ success: false, cached: false }),
        cacheAnalysis: sandbox.stub().resolves(true)
      };

      // Create fresh mock client with consistent behavior
      mockClient = {
        fetchAvailableModels: sandbox.stub().resolves(['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai']),
        verifyModelAvailability: sandbox.stub().callsFake(async (modelId?: string) => {
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
          const normalizedModels = models.map(m => m.toLowerCase().trim());
          
          // For exact model matches
          if (normalizedModels.includes(normalizedModelId)) {
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
            return {
              success: true,
              data: {
                modelAvailable: true,
                modelId: defaultModel, // Always use default llama model
                availableModels: models
              }
            };
          }

          // For other models, they should not be available
          return {
            success: true,
            data: {
              modelAvailable: false,
              modelId: modelId, // Keep the requested model ID
              availableModels: models
            }
          };
        }),
        call: sandbox.stub().callsFake(async () => ({
          success: true,
          data: {
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
            topicPreferences: ['AI', 'Technology']
          },
          hits: 1,
          freeUsesLeft: 5,
          cached: false,
          paymentRequired: false
        }))
      };
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should verify model availability before making API calls', async () => {
      // Inject dependencies first
      aiAgentServiceModule.injectDependencies({
        decentralGPTClient: mockClient,
        userAnalyticsService: mockUserAnalyticsService,
        paymentService: mockPaymentService,
        analysisCacheService: mockAnalysisCacheService
      });

      // Configure mock responses with exact model name
      mockClient.fetchAvailableModels.resolves(['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai']);
      
      
      // First verify model availability - default model should be available
      const verifyResult = await aiAgentServiceModule.verifyModelAvailability();
      expect(verifyResult).to.not.be.null;
      expect(verifyResult.success).to.be.true;
      expect(verifyResult.data).to.exist;
      expect(verifyResult.data.modelAvailable).to.be.true; // Default model should be available
      expect(mockClient.verifyModelAvailability.called).to.be.true;

      // Then verify that a specific model is available
      const specificModelResult = await aiAgentServiceModule.verifyModelAvailability('llama-3.3-70b');
      expect(specificModelResult).to.not.be.null;
      expect(specificModelResult.success).to.be.true;
      expect(specificModelResult.data).to.exist;
      expect(specificModelResult.data.modelAvailable).to.be.true; // Specific model should be available

      // Then test personality analysis
      mockClient.call.resolves({
        success: true,
        data: {
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
          topicPreferences: ['AI', 'Technology']
        },
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false
      });

      const result = await aiAgentServiceModule.analyzePersonality(testXAccountData);
      expect(result).to.not.be.null;
      expect(result.success).to.be.true;
      expect(mockClient.call.called).to.be.true;
      expect(result.data).to.exist;
      expect(result.data).to.deep.include({
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
        topicPreferences: ['AI', 'Technology']
      });
      expect(result.hits).to.equal(1);
    });

    it('should fall back to available model if preferred model is not available', async () => {
      // Set up mock responses with compatible model name
      mockClient.fetchAvailableModels.resolves(['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai']);
      
      // First verify model availability for an unavailable model
      const verifyResult = await aiAgentServiceModule.verifyModelAvailability('unavailable-model');
      expect(verifyResult).to.not.be.null;
      expect(verifyResult.success).to.be.true;
      expect(verifyResult.data).to.exist;
      expect(verifyResult.data.modelAvailable).to.be.false; // Should indicate model is not available
      expect(verifyResult.data.modelId).to.equal('llama-3.3-70b'); // Should fall back to default model
      
      // Then verify that llama-3.3 prefix models are available
      const llamaResult = await aiAgentServiceModule.verifyModelAvailability('llama-3.3-custom');
      expect(llamaResult).to.not.be.null;
      expect(llamaResult.success).to.be.true;
      expect(llamaResult.data).to.exist;
      expect(llamaResult.data.modelAvailable).to.be.true; // Should be available due to llama-3.3 prefix
      expect(llamaResult.data.modelId).to.equal('llama-3.3-70b'); // Should use available llama model
      
      // Then test personality analysis with fallback model
      mockClient.call.resolves({
        success: true,
        data: {
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
          topicPreferences: ['AI', 'Technology']
        },
        hits: 1,
        freeUsesLeft: 5,
        cached: false,
        paymentRequired: false
      });

      const result = await aiAgentServiceModule.analyzePersonality(testXAccountData);
      expect(result).to.not.be.null;
      expect(result.success).to.be.true;
      expect(mockClient.verifyModelAvailability.called).to.be.true;
      expect(mockUserAnalyticsService.getOrCreateUserAnalytics.calledOnce).to.be.true;
      expect(mockAnalysisCacheService.getCachedAnalysis.calledOnce).to.be.true;
    });

    it('should verify model availability directly', async () => {
      // Set up mock responses with exact model name
      mockClient.fetchAvailableModels.resolves(['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai']);

      const result = await aiAgentServiceModule.verifyModelAvailability('llama-3.3-70b');
      expect(result).to.not.be.null;
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      expect(result.data.modelAvailable).to.be.true;
      expect(mockClient.verifyModelAvailability.called).to.be.true;
    });

    it('should handle model verification failure gracefully', async () => {
      // Set up mock responses with no compatible models
      mockClient.fetchAvailableModels.resolves(['gpt-3.5-turbo']);
      mockClient.verifyModelAvailability.resetHistory();

      // Override the mock for this specific test to simulate failure
      mockClient.verifyModelAvailability = sandbox.stub().callsFake(async (modelId?: string) => {
        const models = ['gpt-3.5-turbo'];
        
        // If no modelId provided, use default model
        if (!modelId) {
          return {
            success: true,
            data: {
              modelAvailable: false,
              modelId: 'llama-3.3-70b',
              availableModels: models
            }
          };
        }

        const normalizedModelId = modelId.toLowerCase().trim();
        
        // For this test, no models should be available except gpt-3.5-turbo
        const isAvailable = normalizedModelId === 'gpt-3.5-turbo';

        return {
          success: true,
          data: {
            modelAvailable: isAvailable,
            modelId: modelId,
            availableModels: models
          }
        };
      });

      const result = await aiAgentServiceModule.verifyModelAvailability('llama-3.3-70b');
      expect(result).to.not.be.null;
      expect(result.success).to.be.true;
      expect(result.data).to.exist;
      expect(result.data.modelAvailable).to.be.false; // Should be false since llama-3.3-70b is not available
      expect(mockClient.verifyModelAvailability.called).to.be.true;
    });
  });
});
