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

export function validatePersonalityUpdate(description: string): string | null {
  if (!description || description.trim().length === 0) {
    return 'Personality description is required';
  }

  if (description.length > 1000) {
    return 'Personality description must be less than 1000 characters';
  }

  // Check for potentially harmful content
  const forbiddenPatterns = [
    /<script/i,
    /javascript:/i,
    /data:/i,
    /vbscript:/i
  ];

  if (forbiddenPatterns.some(pattern => pattern.test(description))) {
    return 'Invalid personality description content';
  }

  return null;
}
