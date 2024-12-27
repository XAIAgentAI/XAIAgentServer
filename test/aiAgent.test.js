import { expect } from 'chai';
import sinon from 'sinon';
// Helper function for array comparison
const sortArrays = (obj) => {
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
// Declare module variables with type assertions
let aiAgentServiceModule;
let paymentServiceModule;
let userAnalyticsServiceModule;
let analysisCacheServiceModule;
let decentralGPTStub;
describe('AI Agent Analysis Tests', () => {
    // Create sandbox and stubs for all services
    let sandbox;
    let analyzePersonalityStub;
    let analyzeMatchingStub;
    let getCachedAnalysisStub;
    let getOrCreateUserAnalyticsStub;
    let recordAnalysisStub;
    let validateAndProcessPaymentStub;
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
        decentralGPTStub.callsFake((prompt, context) => {
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
            }
            else if (prompt.includes('compatibility report')) {
                return Promise.resolve(JSON.stringify({
                    matchScore: 0.85,
                    commonInterests: ['tech', 'AI'],
                    compatibility: {
                        values: 0.8,
                        communication: 0.7,
                        interests: 0.9
                    }
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
        const mockXAccountData = {
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
        const mockXAccountData = {
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
            const mockAnalytics = {
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
            const mockMatchingResult = {
                success: true,
                paymentRequired: false,
                freeUsesLeft: 4,
                data: mockMatchingData
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
            const mockAnalytics = {
                userId: 'user123',
                freeMatchingUsesLeft: 0,
                totalMatchingAnalyses: 5,
                lastAnalysisDate: new Date().toISOString(),
                analysisHistory: []
            };
            const mockMatchingData = {
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
            };
            const mockMatchingResult = {
                success: true,
                paymentRequired: true,
                freeUsesLeft: 0,
                data: mockMatchingData
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
            const mockAnalytics = {
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
});
