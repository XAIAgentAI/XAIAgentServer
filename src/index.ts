import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router as webhookRouter } from './routes/webhook.js';
import { router as aiAgentRouter } from './routes/aiAgent.js';
import { router as tokenRouter } from './routes/token.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/webhook', webhookRouter);
app.use('/ai-agent', aiAgentRouter);
app.use('/token', tokenRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
