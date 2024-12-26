import { Types } from 'mongoose';
import { AIAgent } from '../types/index.js';
import { getAgentById } from '../services/aiAgentService.js';

/**
 * Validate training data input
 */
export function validateTrainingData(agentId: string, trainingText: string): string | null {
  if (!agentId || !Types.ObjectId.isValid(agentId)) {
    return 'Invalid agent ID';
  }

  if (!trainingText || typeof trainingText !== 'string') {
    return 'Training text is required and must be a string';
  }

  if (trainingText.length < 10) {
    return 'Training text must be at least 10 characters long';
  }

  if (trainingText.length > 10000) {
    return 'Training text must not exceed 10000 characters';
  }

  return null;
}

/**
 * Verify agent ownership
 */
export async function verifyAgentOwnership(userId: string | undefined, agentId: string): Promise<boolean> {
  if (!userId || !agentId) {
    return false;
  }

  try {
    const agent = await getAgentById(agentId);
    return agent?.xAccountId === userId;
  } catch (error) {
    console.error('Error verifying agent ownership:', error);
    return false;
  }
}
