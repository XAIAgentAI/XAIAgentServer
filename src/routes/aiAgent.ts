import express from 'express';
import { createAIAgent, trainAIAgent } from '../services/aiAgentService.js';
import { XAccountData } from '../types/index.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { xAccountData }: { xAccountData: XAccountData } = req.body;
    const agent = await createAIAgent(xAccountData);
    res.json(agent);
  } catch (error) {
    console.error('Error creating AI agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/train', async (req, res) => {
  try {
    const { agentId, trainingData } = req.body;
    const result = await trainAIAgent(agentId, trainingData);
    res.json(result);
  } catch (error) {
    console.error('Error training AI agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router };
