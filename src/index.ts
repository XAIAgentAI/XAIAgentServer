import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { redisClient } from './services/redisClient.js';
import { router as aiAgentRouter } from './routes/aiAgent.js';
import { router as tokenRouter } from './routes/token.js';
import { router as trainingRouter } from './routes/training.js';
import { router as registrationRouter } from './routes/registration.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Global rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Routes
app.use('/ai-agent', aiAgentRouter);
app.use('/token', tokenRouter);
app.use('/training', trainingRouter);
app.use('/auth', registrationRouter);

// Enhanced health check and monitoring
app.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    // Check Redis connection
    await redisClient.ping();
    
    const metrics = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        redis: 'connected',
        api: 'running'
      },
      environment: process.env.NODE_ENV,
      version: process.version
    };
    
    res.json(metrics);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: errorMessage
    });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server and services
import { startTweetScheduler } from './scheduler/tweetScheduler.js';
import { setupStreamService } from './services/streamService.js';

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toISOString()}`);
  
  // Initialize stream service
  setupStreamService()
    .catch(error => console.error('Failed to setup stream service:', error));
  
  // Start the tweet scheduler
  startTweetScheduler();
  console.log('Tweet scheduler started');
});
