import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { log } from './utils/logger.js';
import { router as aiAgentRouter } from './routes/aiAgent.js';
import { router as tokenRouter } from './routes/token.js';
import { router as trainingRouter } from './routes/training.js';
import { router as registrationRouter } from './routes/registration.js';
import { router as monitoringRouter } from './routes/monitoring.js';
import { router as authRouter } from './routes/auth.js';

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

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  });
  next();
});

// Routes
app.use('/ai-agent', aiAgentRouter);
app.use('/token', tokenRouter);
app.use('/training', trainingRouter);
app.use('/api/v1/registration', registrationRouter);
app.use('/api/v1/monitoring', monitoringRouter);
app.use('/auth', authRouter);

// Enhanced health check and monitoring
app.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    const metrics = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
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
  log.info('Server started', { port: PORT, timestamp: new Date().toISOString() });
  
  // Initialize stream service
  setupStreamService()
    .catch(error => console.error('Failed to setup stream service:', error));
  
  // Start the tweet scheduler
  startTweetScheduler();
  log.info('Tweet scheduler started');
});
