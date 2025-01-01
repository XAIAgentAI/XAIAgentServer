import { TwitterApi } from 'twitter-api-v2';
import { log } from '../utils/logger.js';

// Initialize environment variables
if (!process.env.TWITTER_CLIENT_ID || !process.env.TWITTER_CLIENT_SECRET) {
  throw new Error('Missing required Twitter OAuth 2.0 credentials');
}

export interface OAuthState {
  url: string;
  state: string;
  codeVerifier: string;
}

export class AuthService {
  private static readonly CALLBACK_URL = process.env.TWITTER_CALLBACK_URL || 'http://localhost:3001/auth/callback';
  private static readonly SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

  /**
   * Generate OAuth 2.0 authorization URL
   * twitter-api-v2 handles PKCE internally
   */
  public static generateAuthUrl(): OAuthState {
    try {
      const client = new TwitterApi({
        clientId: process.env.TWITTER_CLIENT_ID!,
        clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      });

      // twitter-api-v2 handles PKCE internally
      const { url, state, codeVerifier } = client.generateOAuth2AuthLink(this.CALLBACK_URL, {
        scope: this.SCOPES,
      });

      log.info('Generated OAuth 2.0 authorization URL', { state });

      return {
        url,
        state,
        codeVerifier,
      };
    } catch (error) {
      log.error('Error generating auth URL:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for access token
   */
  public static async exchangeAuthCode(
    code: string,
    codeVerifier: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const client = new TwitterApi({
        clientId: process.env.TWITTER_CLIENT_ID!,
        clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      });

      const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: this.CALLBACK_URL,
      });

      if (!accessToken || !refreshToken || !expiresIn) {
        throw new Error('Invalid response from Twitter OAuth 2.0');
      }

      log.info('Successfully exchanged auth code for tokens');

      return {
        accessToken,
        refreshToken,
        expiresIn,
      };
    } catch (error) {
      log.error('Error exchanging auth code:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public static async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const client = new TwitterApi({
        clientId: process.env.TWITTER_CLIENT_ID!,
        clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      });

      const { accessToken, refreshToken: newRefreshToken, expiresIn } = 
        await client.refreshOAuth2Token(refreshToken);

      if (!accessToken || !newRefreshToken || !expiresIn) {
        throw new Error('Invalid response from Twitter token refresh');
      }

      log.info('Successfully refreshed access token');

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn,
      };
    } catch (error) {
      log.error('Error refreshing token:', error);
      throw error;
    }
  }
}

export default AuthService;
