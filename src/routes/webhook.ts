import express from 'express';
import rateLimit from 'express-rate-limit';
import { handleXMention } from '../services/xService.js';
import { MentionType } from '../types/index.js';
import { XAccountData, TwitterAPIError } from '../types/twitter.js';

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
    const { accountData } = req.body;
    if (!accountData?.mentionText || !accountData?.profile?.username) {
      return res.status(400).json({ error: 'Invalid mention data' });
    }

    const mentionText = accountData.mentionText.toLowerCase();
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

// Middleware to validate mention data
const validateMentionData = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { accountData } = req.body;
  
  if (!accountData?.id || !accountData?.profile?.username || !accountData?.mentionText) {
    console.log('Validation failed:', {
      hasId: !!accountData?.id,
      hasUsername: !!accountData?.profile?.username,
      hasMentionText: !!accountData?.mentionText,
      accountData: accountData
    });
    return res.status(400).json({ 
      error: 'Invalid mention data',
      details: 'Missing required fields: id, profile.username, or mentionText'
    });
  }

  // Initialize empty tweets array if not present
  if (!accountData.tweets) {
    accountData.tweets = [];
  }

  // Extract tweetId from the request
  if (req.body.tweetId) {
    req.body.accountData.tweetId = req.body.tweetId;
  }

  next();
};

router.post('/x-mention', [validateMentionData, mentionTypeLimiter], async (req: express.Request, res: express.Response) => {
  try {
    console.log('Received webhook request:', JSON.stringify(req.body, null, 2));
    console.log('Received X mention:', {
      name: req.body.accountData.profile.name,
      tweetId: req.body.accountData.tweetId,
      mentionText: req.body.accountData.mentionText
    });

    const mentionData: { accountData: XAccountData; creatorAddress: string } = req.body;
    const result = await handleXMention(mentionData);

    // Log the response
    console.log('Processed X mention:', {
      name: mentionData.accountData.profile.name,
      success: result.success,
      type: result.data?.type
    });

    res.json(result);
  } catch (error: unknown) {
    console.error('Error handling X mention:', error);
    
    const err = error as TwitterAPIError;
    
    // Handle specific error types
    if (err.message?.includes('rate limit')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        retryAfter: err.retryAfter || 60
      });
    }
    
    if (err.message?.includes('Twitter API')) {
      return res.status(502).json({ 
        error: 'Twitter API error',
        details: err.message
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export { router };
