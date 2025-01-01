import express from 'express';
import { createToken } from '../services/tokenService.js';
import { generateTokenName } from '../services/aiAgentService.js';
import { XAccountData } from '../types/twitter.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { xAccountData, creatorAddress }: { xAccountData: XAccountData; creatorAddress: string } = req.body;
    const tokenMetadata = await generateTokenName(xAccountData);
    const token = await createToken({ ...tokenMetadata, userId: xAccountData.id }, creatorAddress);
    res.json(token);
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router };
