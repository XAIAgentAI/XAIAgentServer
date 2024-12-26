import { createAIAgent } from './aiAgentService.js';
import { createToken } from './tokenService.js';
import { XAccountData, AIAgent, Token } from '../types/index.js';

export async function handleXMention(mentionData: { accountData: XAccountData; creatorAddress: string }) {
  try {
    // Create AI agent from X account data
    const agent = await createAIAgent(mentionData.accountData);
    
    // Create token for the AI agent
    const token = await createToken(mentionData.accountData, mentionData.creatorAddress);
    
    return {
      agent,
      token,
      status: 'success'
    };
  } catch (error) {
    console.error('Error in handleXMention:', error);
    throw error;
  }
}
