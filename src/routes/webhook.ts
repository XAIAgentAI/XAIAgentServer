import express from 'express';
import { handleXMention } from '../services/xService.js';
import { XAccountData } from '../types/index.js';

const router = express.Router();

router.post('/x-mention', async (req, res) => {
  try {
    const mentionData: { accountData: XAccountData; creatorAddress: string } = req.body;
    const result = await handleXMention(mentionData);
    res.json(result);
  } catch (error) {
    console.error('Error handling X mention:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router };
