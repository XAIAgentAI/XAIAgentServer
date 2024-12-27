import express from 'express';
import rateLimit from 'express-rate-limit';
import { handleXMention } from '../services/xService.js';
import { XAccountData, MentionType } from '../types/index.js';

const router = express.Router();

// Rate limiter for token creation - stricter limits
const tokenCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // Limit each IP to 3 token creations per day
  message: 'Too many token creation requests. Please try again tomorrow.',
  skipFailedRequests: true
});

// Rate limiter for questions - more lenient
const questionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 questions per 15 minutes
  message: 'Too many questions. Please try again in 15 minutes.',
  skipFailedRequests: true
});

// Middleware to determine mention type and apply appropriate rate limiter
const mentionTypeLimiter = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const mentionData = req.body;
    if (!mentionData?.accountData?.mentionText) {
      return res.status(400).json({ error: 'Invalid mention data' });
    }

    const mentionText = mentionData.accountData.mentionText.toLowerCase();
    const isTokenCreation = mentionText.includes('create token') || 
                           mentionText.includes('创建代币') ||
                           mentionText.includes('create bot') ||
                           mentionText.includes('创建机器人') ||
                           mentionText.includes('create agent') ||
                           mentionText.includes('创建代理') ||
                           mentionText.includes('create virtual') ||
                           mentionText.includes('创建虚拟人');

    return isTokenCreation ? tokenCreationLimiter(req, res, next) : questionLimiter(req, res, next);
  } catch (error) {
    console.error('Error in mention type limiter:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

router.post('/x-mention', mentionTypeLimiter, async (req: express.Request, res: express.Response) => {
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
