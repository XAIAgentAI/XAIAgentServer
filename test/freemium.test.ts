import { expect } from 'chai';
import sinon from 'sinon';
import { handleXMention } from '../src/services/xService.js';
import { XAccountData } from '../src/types/twitter.js';
import { MentionResponse, APIResponse } from '../src/types/index.js';

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
      analyzePersonality: sinon.stub().resolves({
        traits: ['friendly', 'analytical'],
        description: 'A friendly and analytical personality'
      }),
      generateResponse: sinon.stub().resolves('Test response'),
      matchPersonalities: sinon.stub().resolves({
        score: 0.85,
        explanation: 'High compatibility'
      })
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
    expect(result1.data?.freeUsesLeft).to.equal(4);

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
  });

  it('should not count empty mentions against free uses', async () => {
    const emptyMentionData = {
      accountData: {
        id: '123456',
        profile: {
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
    }
  });
});
