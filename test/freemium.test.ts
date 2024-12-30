import { expect } from 'chai';
import sinon from 'sinon';
import { handleXMention } from '../src/services/xService.js';
import type { XAccountData } from '../src/types/twitter.js';
import type { MentionResponse, APIResponse, ServiceResponse } from '../src/types/index.js';
import type { SinonStub } from 'sinon';

function createAPIResponse(data: MentionResponse): APIResponse<MentionResponse> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
}

describe('Freemium Model Tests', () => {
  let mockTokenService: any;
  let mockAIService: any;

  beforeEach(() => {
    mockTokenService = {
      createToken: sinon.stub(),
      validateTokenName: sinon.stub(),
      getTokenByCreator: sinon.stub(),
      confirmTokenName: sinon.stub(),
      generateTokenMetadata: sinon.stub(),
      deployTokenContract: sinon.stub(),
      transferTokens: sinon.stub(),
      renounceOwnership: sinon.stub()
    };

    mockAIService = {
      verifyModelAvailability: sinon.stub().callsFake(async (modelId?: string) => {
        const models = ['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai'];
        
        // If no modelId provided, use default model
        if (!modelId) {
          return {
            success: true,
            data: {
              modelAvailable: true,
              modelId: 'llama-3.3-70b',
              availableModels: models
            }
          };
        }

        const normalizedModelId = modelId.toLowerCase().trim();
        
        // For llama-3.3 models, check if any llama-3.3 model is available
        if (normalizedModelId.startsWith('llama-3.3')) {
          return {
            success: true,
            data: {
              modelAvailable: true,
              modelId: modelId,
              availableModels: models
            }
          };
        }

        // For gpt-4, it should be available
        if (normalizedModelId === 'gpt-4') {
          return {
            success: true,
            data: {
              modelAvailable: true,
              modelId: modelId,
              availableModels: models
            }
          };
        }

        // For other models, they should not be available
        return {
          success: true,
          data: {
            modelAvailable: false,
            modelId: modelId,
            availableModels: models
          }
        };
      }) as SinonStub<[modelId?: string], Promise<ServiceResponse<{ modelAvailable: boolean; modelId?: string; availableModels?: string[]; }>>>,
      createAIAgent: sinon.stub().callsFake(async (accountData: any, personality?: any) => {
        return {
          success: true,
          data: {
            id: 'test-agent-1',
            xAccountId: accountData.id,
            personality: personality || {
              description: 'A helpful AI assistant',
              traits: ['helpful', 'friendly'],
              interests: ['technology', 'AI'],
              writingStyle: {
                formal: 0.7,
                technical: 0.6,
                friendly: 0.8
              }
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          hits: 1,
          freeUsesLeft: 5,
          cached: false,
          paymentRequired: false
        };
      }),
      analyzePersonality: sinon.stub().callsFake(async () => {
        const response = {
          success: true,
          data: {
            type: 'EMPTY',
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
            topicPreferences: ['AI'],
            hits: 1
          },
          hits: 1,
          freeUsesLeft: 5,
          cached: false,  // First call should not be cached
          paymentRequired: false,
          error: undefined
        };
        // After first call, return cached response with same hits count
        mockAIService.analyzePersonality = sinon.stub().resolves({
          ...response,
          cached: true,
          hits: 1  // Keep hits at 1 for cached responses
        });
        return response;
      }),
      generateResponse: sinon.stub().callsFake(async () => ({
        success: true,
        data: 'Test response',
        hits: 1,
        freeUsesLeft: 5,
        cached: true,
        paymentRequired: false
      })),
      matchPersonalities: sinon.stub().callsFake(async () => ({
        success: true,
        data: {
          score: 0.85,
          explanation: 'High compatibility'
        },
        hits: 1,
        freeUsesLeft: 5,
        cached: true,
        paymentRequired: false
      }))
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should track free uses correctly', async () => {
    const mentionData = {
      accountData: {
        id: '123456',
        profile: {
          id: 'test-profile-freemium-1',
          username: 'testuser',
          name: 'Test User',
          description: 'Test account',
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
            text: 'Test tweet',
            createdAt: new Date().toISOString(),
            user: {
              screenName: 'testuser',
              name: 'Test User',
              profileImageUrl: 'https://example.com/profile.jpg',
              description: 'Test account',
              followersCount: 100,
              friendsCount: 200,
              location: 'Test Location'
            },
            images: [],
            videos: [],
            url: 'https://x.com/testuser/status/1'
          }
        ],
        mentionText: '@XAIAgentAI analyze @otheruser',
        tweetId: '1'
      },
      creatorAddress: '0x1234567890123456789012345678901234567890'
    };

    // First request should have 4 free uses left
    const result1 = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(result1.success).to.be.true;
    expect(result1.data).to.exist;
    if (result1.data) {
      expect(result1.data.freeUsesLeft).to.equal(4);
      expect(result1.data.hits).to.equal(1); // Hits should start from 1
    } else {
      throw new Error('Expected data in response');
    }

    // Second request should have 3 free uses left
    const result2 = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(result2.success).to.be.true;
    expect(result2.data?.freeUsesLeft).to.equal(3);

    // Make 3 more requests to use up remaining free uses
    for (let i = 0; i < 3; i++) {
      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data?.freeUsesLeft).to.equal(2 - i);
    }

    // Next request should have 0 free uses left and require payment
    const result6 = await handleXMention(mentionData, mockTokenService, mockAIService);
    expect(result6.success).to.be.true;
    expect(result6.data?.freeUsesLeft).to.equal(0);
    expect(result6.data?.paymentRequired).to.be.true;
    expect(result6.error).to.equal('PAYMENT_REQUIRED');
    expect(result6.errorMessage).to.equal('Payment required to continue using the service.');
    expect(result6.data?.cached).to.be.true;
    expect(result6.data?.hits).to.equal(1);
  });

  it('should not count empty mentions against free uses', async () => {
    const emptyMentionData = {
      accountData: {
        id: '123456',
        profile: {
          id: 'test-profile-freemium-2',
          username: 'testuser',
          name: 'Test User',
          description: 'Test account',
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
            text: 'Test tweet',
            createdAt: new Date().toISOString(),
            user: {
              screenName: 'testuser',
              name: 'Test User',
              profileImageUrl: 'https://example.com/profile.jpg',
              description: 'Test account',
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

    // Make multiple empty mentions
    for (let i = 0; i < 10; i++) {
      const result = await handleXMention(emptyMentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data?.freeUsesLeft).to.equal(5); // Should always be 5 for empty mentions
      expect(result.data?.hits).to.equal(1); // Hits should start from 1
    }
  });
});
