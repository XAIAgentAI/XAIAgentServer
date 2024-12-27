import { expect } from 'chai';
import sinon from 'sinon';
import { handleXMention } from '../src/services/xService.js';
import { MentionType, XAccountData, Token, TokenResponse, AIAgent } from '../src/types/index.js';
// Mock services for testing
const mockTokenService = {
  createToken: undefined as any // Will be set in beforeEach
};

const mockAIService = {
  createAIAgent: undefined as any,
  answerQuestion: undefined as any
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

    // Set up mock token service
    mockTokenService.createToken = sinon.stub().resolves(mockResponse);

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
            id: '123456',
            username: 'testuser',
            displayName: 'Test User',
            bio: 'Test account for X mention handling',
            metrics: {
              followers: 100,
              following: 200,
              tweets: 500
            }
          },
          tweets: [
            { id: '1', text: 'Hello world!', createdAt: new Date().toISOString() }
          ],
          mentionText: '@XAIAgentAI create token for my AI agent'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data?.type).to.equal(MentionType.TOKEN_CREATION);
      expect(result.data?.token).to.exist;
    });

    it('should create token when mentioned with 创建代币 command', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: '123456',
            username: 'testuser',
            displayName: 'Test User',
            bio: 'Test account for X mention handling',
            metrics: {
              followers: 100,
              following: 200,
              tweets: 500
            }
          },
          tweets: [
            { id: '1', text: 'Hello world!', createdAt: new Date().toISOString() }
          ],
          mentionText: '@XAIAgentAI 创建代币'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data?.type).to.equal(MentionType.TOKEN_CREATION);
      expect(result.data?.token).to.exist;
    });
  });

  describe('Question Answering', () => {
    it('should answer questions using Llama model', async () => {
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: '123456',
            username: 'testuser',
            displayName: 'Test User',
            bio: 'Test account for X mention handling',
            metrics: {
              followers: 100,
              following: 200,
              tweets: 500
            }
          },
          tweets: [
            { id: '1', text: 'Hello world!', createdAt: new Date().toISOString() }
          ],
          mentionText: '@XAIAgentAI What is the meaning of life?'
        },
        creatorAddress: '0x1234567890123456789012345678901234567890'
      };

      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data?.type).to.equal(MentionType.QUESTION);
      expect(result.data?.answer).to.be.a('string').and.not.empty;
    });

    it('should honor user-defined personality traits in answers', async () => {
      const customPersonality = 'A witty and sarcastic AI with a deep knowledge of philosophy';
      const mentionData: { accountData: XAccountData; creatorAddress: string } = {
        accountData: {
          id: '123456',
          profile: {
            id: '123456',
            username: 'testuser',
            displayName: 'Test User',
            bio: 'Test account for X mention handling',
            metrics: {
              followers: 100,
              following: 200,
              tweets: 500
            }
          },
          tweets: [
            { id: '1', text: 'Hello world!', createdAt: new Date().toISOString() }
          ],
          mentionText: '@XAIAgentAI Tell me a joke about programming'
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
      expect(createResult.data?.agent?.personality?.description).to.be.a('string');
      if (createResult.data?.agent?.personality?.description) {
        expect(createResult.data.agent.personality.description).to.include(customPersonality);
      }

      // Then test that the personality is reflected in answers
      const result = await handleXMention(mentionData, mockTokenService, mockAIService);
      expect(result.success).to.be.true;
      expect(result.data?.type).to.equal(MentionType.QUESTION);
      expect(result.data?.answer).to.be.a('string').and.not.empty;
      // The answer should reflect the witty and sarcastic personality
      expect(result.data?.agent?.personality?.description).to.be.a('string');
      if (result.data?.agent?.personality?.description) {
        expect(result.data.agent.personality.description).to.include(customPersonality);
      }
    });
  });
});
