import express from 'express';
import { redisClient } from '../services/redisClient.js';

export const router = express.Router();

interface UserData {
  username: string;
  email: string;
  password: string;
  createdAt: string;
}

// User registration endpoint
router.post('/register', async (req: express.Request, res: express.Response) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['username', 'email', 'password']
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await redisClient.hGet('users', email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Store user data in Redis
    const userData: UserData = {
      username,
      email,
      password: password, // Note: In production, this should be hashed
      createdAt: new Date().toISOString(),
    };

    await redisClient.hSet('users', email, JSON.stringify(userData));

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        username,
        email,
        createdAt: userData.createdAt,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
