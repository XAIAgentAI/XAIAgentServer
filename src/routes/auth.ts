import express from 'express';
import { AuthService } from '../services/authService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Store PKCE and state in memory (should use Redis in production)
const authStates = new Map<string, { codeVerifier: string; codeChallenge: string }>();

/**
 * Initialize OAuth 2.0 flow
 */
router.get('/login', (req, res) => {
  try {
    const { url, state, codeVerifier, codeChallenge } = AuthService.generateAuthUrl();
    
    
    // Store PKCE values
    authStates.set(state, { codeVerifier, codeChallenge });
    
    log.info('Initiating OAuth 2.0 flow', { state });
    
    // Redirect to Twitter authorization page
    res.redirect(url);
  } catch (error) {
    log.error('Error initializing OAuth flow:', error);
    res.status(500).json({ error: 'Failed to initialize OAuth flow' });
  }
});

/**
 * Handle OAuth 2.0 callback
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      throw new Error('Invalid callback parameters');
    }

    const storedState = authStates.get(state);
    if (!storedState) {
      throw new Error('Invalid state parameter');
    }

    const { codeVerifier } = storedState;
    
    log.info('Processing OAuth callback', { state });
    
    // Exchange code for tokens
    const { accessToken, refreshToken, expiresIn } = await AuthService.exchangeAuthCode(
      code,
      codeVerifier
    );

    // Clean up stored state
    authStates.delete(state);

    // Store tokens in session with proper initialization
    req.session.tokens = {
      accessToken: accessToken as string,
      refreshToken: refreshToken as string,
      expiresAt: Date.now() + (expiresIn as number) * 1000
    };

    log.info('OAuth flow completed successfully', { state });
    res.redirect('/dashboard'); // Redirect to your app's dashboard
  } catch (error) {
    log.error('Error handling OAuth callback:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    if (!req.session.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const currentRefreshToken = req.session.tokens?.refreshToken;
    if (!currentRefreshToken) {
      throw new Error('No refresh token available');
    }
    
    log.info('Refreshing access token');
    
    const { accessToken, refreshToken: newRefreshToken, expiresIn } = 
      await AuthService.refreshAccessToken(currentRefreshToken);

    // Update stored tokens
    req.session.tokens = {
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt: Date.now() + expiresIn * 1000
    };

    log.info('Token refresh successful');
    res.json({ success: true });
  } catch (error) {
    log.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

export { router };
