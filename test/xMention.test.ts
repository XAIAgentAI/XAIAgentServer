import { expect } from 'chai';
import { handleXMention } from '../src/services/xService.js';
import { MentionType, XAccountData } from '../src/types/index.js';

describe('X Mention Handling', () => {
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

      const result = await handleXMention(mentionData);
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

      const result = await handleXMention(mentionData);
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

      const result = await handleXMention(mentionData);
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
      });

      expect(createResult.success).to.be.true;
      expect(createResult.data?.agent?.personality?.description).to.include(customPersonality);

      // Then test that the personality is reflected in answers
      const result = await handleXMention(mentionData);
      expect(result.success).to.be.true;
      expect(result.data?.type).to.equal(MentionType.QUESTION);
      expect(result.data?.answer).to.be.a('string').and.not.empty;
      // The answer should reflect the witty and sarcastic personality
      expect(result.data?.agent?.personality?.description).to.include(customPersonality);
    });
  });
});
