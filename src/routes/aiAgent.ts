import express from 'express';
import { 
  createAIAgent, 
  trainAIAgent,
  generateTokenName,
  answerQuestion,
  generateVideoContent,
  searchAndOrganizeContent,
  analyzePersonality,
  analyzeMatching
} from '../services/aiAgentService';
import { getCachedAnalysis, cacheAnalysis } from '../services/analysisCacheService';
import { validateAndProcessPayment } from '../services/paymentService';
import { getOrCreateUserAnalytics, recordAnalysis } from '../services/userAnalyticsService';
import { 
  XAccountData, 
  APIResponse, 
  AnalysisRequest,
  PersonalAnalysisResult,
  MatchingAnalysisResult 
} from '../types';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for AI operations
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50 // limit each IP to 50 requests per windowMs
});

router.use(aiLimiter);

// Personal analysis endpoint - always free
router.post('/analyze/personal', async (req: express.Request, res: express.Response) => {
  try {
    const { userId, xAccountData }: { userId: string; xAccountData: XAccountData } = req.body;
    
    if (!userId || !xAccountData) {
      return res.status(400).json({ 
        success: false,
        error: 'userId and xAccountData are required',
        timestamp: new Date().toISOString()
      });
    }

    // Record personal analysis
    await recordAnalysis(
      userId,
      'personal',
      {
        timestamp: new Date().toISOString(),
        usedFreeCredit: false
      }
    );

    // Check cache first
    const cachedResult = getCachedAnalysis(userId, 'personal');
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    const result = await analyzePersonality(xAccountData);
    
    // Cache the results
    cacheAnalysis(userId, 'personal', result);
    
    const response: APIResponse<PersonalAnalysisResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error in personal analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Matching analysis endpoint - requires XAA payment after free uses
router.post('/analyze/matching', async (req: express.Request, res: express.Response) => {
  try {
    const { 
      userId, 
      targetUserId, 
      userAddress,
      userXAccountData,
      targetXAccountData 
    }: {
      userId: string;
      targetUserId: string;
      userAddress: string;
      userXAccountData: XAccountData;
      targetXAccountData: XAccountData;
    } = req.body;
    
    if (!userId || !targetUserId || !userAddress || !userXAccountData || !targetXAccountData) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId, targetUserId, userAddress, userXAccountData, targetXAccountData',
        timestamp: new Date().toISOString()
      });
    }

    // Get user analytics to check free uses
    const analytics = await getOrCreateUserAnalytics(userId);

    // Validate and process payment if needed
    const paymentResult = await validateAndProcessPayment(userAddress, analytics);
    
    if (!paymentResult.success) {
      return res.status(402).json({
        success: false,
        error: paymentResult.error,
        paymentRequired: true,
        requiresApproval: paymentResult.requiresApproval,
        approvalData: paymentResult.approvalData,
        freeUsesLeft: analytics.freeMatchingUsesLeft,
        timestamp: new Date().toISOString()
      });
    }

    // Record matching analysis
    await recordAnalysis(
      userId,
      'matching',
      {
        targetUserId,
        timestamp: new Date().toISOString(),
        usedFreeCredit: analytics.freeMatchingUsesLeft > 0
      }
    );

    // Perform matching analysis
    // Check cache first
    const cachedResult = getCachedAnalysis(userId, 'matching', targetUserId);
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        timestamp: new Date().toISOString(),
        cached: true,
        transactionHash: paymentResult.transactionHash
      });
    }

    const result = await analyzeMatching(userXAccountData, targetXAccountData);
    
    // Cache the results
    cacheAnalysis(userId, 'matching', result, targetUserId);

    const response: APIResponse<MatchingAnalysisResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };

    // Include transaction hash if payment was made
    if (paymentResult.transactionHash) {
      response.data = {
        ...result,
        transactionHash: paymentResult.transactionHash
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error in matching analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Create AI agent from X account
router.post('/create', async (req, res) => {
  try {
    const { xAccountData }: { xAccountData: XAccountData } = req.body;
    const agent = await createAIAgent(xAccountData);
    
    const response: APIResponse<typeof agent> = {
      success: true,
      data: agent,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error creating AI agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create AI agent',
      timestamp: new Date().toISOString()
    });
  }
});

// Generate or regenerate token name
router.post('/:agentId/token/name', async (req, res) => {
  try {
    const { agentId } = req.params;
    // TODO: Get agent from database
    const agent = await getAgentFromDb(agentId);
    
    const tokenMetadata = await generateTokenName(agent);
    
    const response: APIResponse<typeof tokenMetadata> = {
      success: true,
      data: tokenMetadata,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error generating token name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate token name',
      timestamp: new Date().toISOString()
    });
  }
});

// Update token name manually
router.put('/:agentId/token/name', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, symbol, description } = req.body;
    
    // TODO: Update token metadata in database
    const updatedMetadata = { name, symbol, description, timestamp: new Date().toISOString() };
    
    const response: APIResponse<typeof updatedMetadata> = {
      success: true,
      data: updatedMetadata,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error updating token name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update token name',
      timestamp: new Date().toISOString()
    });
  }
});

// Answer fan question
router.post('/:agentId/answer', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { question } = req.body;
    
    // TODO: Get agent from database
    const agent = await getAgentFromDb(agentId);
    
    const answer = await answerQuestion(agent, question);
    
    const response: APIResponse<string> = {
      success: true,
      data: answer,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to answer question',
      timestamp: new Date().toISOString()
    });
  }
});

// Generate video content
router.post('/:agentId/video', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { topic } = req.body;
    
    // TODO: Get agent from database
    const agent = await getAgentFromDb(agentId);
    
    const videoScript = await generateVideoContent(agent, topic);
    
    const response: APIResponse<string> = {
      success: true,
      data: videoScript,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error generating video content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate video content',
      timestamp: new Date().toISOString()
    });
  }
});

// Search and organize content
router.post('/:agentId/search', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { query } = req.body;
    
    // TODO: Get agent from database
    const agent = await getAgentFromDb(agentId);
    
    const results = await searchAndOrganizeContent(agent, query);
    
    const response: APIResponse<typeof results> = {
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error searching content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search content',
      timestamp: new Date().toISOString()
    });
  }
});

// Train AI agent with new data
router.post('/:agentId/train', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { tweets } = req.body;
    
    await trainAIAgent(agentId, { tweets });
    
    const response: APIResponse<null> = {
      success: true,
      data: null,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error training agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to train agent',
      timestamp: new Date().toISOString()
    });
  }
});

// Temporary function until database is implemented
async function getAgentFromDb(agentId: string) {
  // TODO: Implement database integration
  return {
    id: agentId,
    xAccountId: 'dummy',
    personality: {
      mbti: 'INTJ',
      traits: ['analytical', 'strategic'],
      interests: ['technology', 'innovation'],
      values: ['efficiency', 'knowledge'],
      communicationStyle: {
        primary: 'direct',
        strengths: ['clarity', 'precision'],
        weaknesses: ['brevity']
      },
      professionalAptitude: {
        industries: ['tech', 'research'],
        skills: ['analysis', 'planning'],
        workStyle: 'independent'
      },
      socialInteraction: {
        style: 'professional',
        preferences: ['structured discussions'],
        challenges: ['small talk']
      },
      contentCreation: {
        topics: ['tech trends', 'analysis'],
        style: 'informative',
        engagement_patterns: ['q&a', 'tutorials']
      },
      description: 'Technical expert focused on innovation',
      lastUpdated: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    lastTrained: new Date().toISOString(),
    trainingHistory: [],
    capabilities: {
      canGenerateVideo: true,
      canAnswerQuestions: true,
      canSearchContent: true,
      apiEnabled: true
    },
    metrics: {
      totalInteractions: 0,
      questionsAnswered: 0,
      contentGenerated: 0,
      searchesPerformed: 0
    }
  };
}

export { router };
