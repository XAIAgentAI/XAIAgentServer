import { Router, Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { storeTrainingData, updateAgentPersonality } from '../services/aiAgentService.js';
import { validateTrainingData, validatePersonalityUpdate, verifyAgentOwnership } from '../utils/validation.js';
import { TrainingDataRequest, PersonalityUpdateRequest, AuthenticatedRequest, PersonalityAnalysis } from '../types/index.js';

export const router = Router();

/**
 * @route POST /training/data
 * @description Store custom training data for an AI agent
 * @access Private - Requires agent owner authentication
 */
router.post('/data', async (req: AuthenticatedRequest & { body: TrainingDataRequest }, res: Response) => {
  try {
    const { agentId, trainingText }: TrainingDataRequest = req.body;

    // Validate request data
    const validationError = validateTrainingData(agentId, trainingText);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Verify ownership (assuming middleware sets req.user)
    const isOwner = await verifyAgentOwnership(req.user?.id, agentId);
    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to train this agent' });
    }

    // Store training data
    await storeTrainingData(agentId, trainingText);

    res.status(200).json({
      success: true,
      message: 'Training data stored successfully'
    });
  } catch (error) {
    console.error('Error storing training data:', error);
    res.status(500).json({ error: 'Failed to store training data' });
  }
});

/**
 * @route POST /training/personality/:agentId
 * @description Update an AI agent's personality traits
 * @access Private - Requires agent owner authentication
 */
router.post('/personality/:agentId', async (req: AuthenticatedRequest & { body: PersonalityUpdateRequest }, res: Response) => {
  try {
    const agentId = req.params.agentId;
    const { description }: PersonalityUpdateRequest = req.body;

    // Validate request data
    const validationError = validatePersonalityUpdate(description);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
        timestamp: new Date().toISOString()
      });
    }

    // Verify ownership
    const isOwner = await verifyAgentOwnership(req.user?.id, agentId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this agent',
        timestamp: new Date().toISOString()
      });
    }

    // Update personality
    const personality: PersonalityAnalysis = {
      description,
      mbti: '',
      traits: [],
      interests: [],
      values: [],
      communicationStyle: {
        primary: '',
        strengths: [],
        weaknesses: [],
        languages: []
      },
      professionalAptitude: {
        industries: [],
        skills: [],
        workStyle: ''
      },
      socialInteraction: {
        style: '',
        preferences: [],
        challenges: []
      },
      contentCreation: {
        topics: [],
        style: '',
        engagement_patterns: []
      },
      lastUpdated: new Date().toISOString()
    };
    const updatedAgent = await updateAgentPersonality(agentId, personality);

    res.status(200).json({
      success: true,
      data: updatedAgent,
      message: 'Agent personality updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating agent personality:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update agent personality',
      timestamp: new Date().toISOString()
    });
  }
});
