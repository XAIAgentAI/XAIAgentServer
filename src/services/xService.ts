import { createAIAgent as defaultCreateAIAgent, answerQuestion as defaultAnswerQuestion } from './aiAgentService.js';
import * as defaultTokenService from './tokenService.js';
import { AIAgent, Token, MentionType, APIResponse } from '../types/index.js';
import { XAccountData } from '../types/twitter.js';

interface AIService {
  createAIAgent: typeof defaultCreateAIAgent;
  answerQuestion: typeof defaultAnswerQuestion;
}

import TwitterClient from './twitterClient.js';

const defaultAIService: AIService = {
  createAIAgent: defaultCreateAIAgent,
  answerQuestion: defaultAnswerQuestion
};

function detectMentionType(mentionText: string): MentionType {
  const tokenCreationKeywords = [
    'create token', '创建代币',
    'create bot', '创建机器人',
    'create agent', '创建代理',
    'create virtual', '创建虚拟人'
  ];
  
  const hasTokenCreationKeyword = tokenCreationKeywords.some(keyword => 
    mentionText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  return hasTokenCreationKeyword ? MentionType.TOKEN_CREATION : MentionType.QUESTION;
}

async function answerXMentionQuestion(
  accountData: XAccountData,
  aiService: AIService = defaultAIService
): Promise<APIResponse<{ agent: AIAgent; answer: string }>> {
  try {
    if (!accountData.mentionText) {
      throw new Error('Mention text is required');
    }

    // Create or get AI agent for the user
    const agent = await aiService.createAIAgent(accountData);
    
    // Get answer using Llama3.3 model
    const answer = await aiService.answerQuestion(agent, accountData.mentionText);

    return {
      success: true,
      data: {
        agent,
        answer
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in answerXMentionQuestion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

export async function handleXMention(
  mentionData: { accountData: XAccountData; creatorAddress: string },
  injectedTokenService = defaultTokenService,
  injectedAIService: AIService = defaultAIService
): Promise<APIResponse<{ agent: AIAgent; token?: Token; answer?: string; type: MentionType }>> {
  try {
    if (!mentionData.accountData.mentionText) {
      throw new Error('Mention text is required');
    }

    const mentionType = detectMentionType(mentionData.accountData.mentionText);
    
    // Create AI agent from X account data
    const agent = await injectedAIService.createAIAgent(mentionData.accountData);
    
    if (mentionType === MentionType.TOKEN_CREATION) {
      // Create token for the AI agent
      const token = await injectedTokenService.createToken(mentionData.accountData, mentionData.creatorAddress);
      return {
        success: true,
        data: {
          agent,
          token,
          type: mentionType
        },
        timestamp: new Date().toISOString()
      };
    } else {
      // Handle question using Llama3.3 model
      const questionResponse = await answerXMentionQuestion(mentionData.accountData, injectedAIService);
      if (!questionResponse.success || !questionResponse.data) {
        return {
          success: false,
          error: questionResponse.error || 'Failed to get answer',
          timestamp: new Date().toISOString()
        };
      }
      // Post response to Twitter
      const answer = questionResponse.data.answer;
      await TwitterClient.postResponse(answer, mentionData.accountData.tweetId);
      
      return {
        success: true,
        data: {
          agent,
          answer,
          type: mentionType
        },
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error('Error in handleXMention:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}
