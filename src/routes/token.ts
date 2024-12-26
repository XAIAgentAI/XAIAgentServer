import express from 'express';
import { createToken } from '../services/tokenService.js';
import { XAccountData } from '../types/index.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { xAccountData, creatorAddress }: { xAccountData: XAccountData; creatorAddress: string } = req.body;
    const token = await createToken(xAccountData, creatorAddress);
    res.json(token);
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router };
