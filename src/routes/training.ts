import { Router } from 'express';
import { storeTrainingData } from '../services/aiAgentService.js';
import { validateTrainingData, verifyAgentOwnership } from '../utils/validation.js';
import { TrainingDataRequest } from '../types/index.js';

export const router = Router();

/**
 * @route POST /training/data
 * @description Store custom training data for an AI agent
 * @access Private - Requires agent owner authentication
 */
router.post('/data', async (req, res) => {
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
