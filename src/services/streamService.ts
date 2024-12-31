import { TwitterApi, TweetStream, TweetV2SingleStreamResult, ETwitterStreamEvent } from 'twitter-api-v2';
import { EventEmitter } from 'events';
import { XMentionEvent } from '../types/events.js';
import { XAccountData } from '../types/twitter.js';

export class StreamService extends EventEmitter {
  private readClient: TwitterApi;  // OAuth 2.0 client for read operations
  private writeClient: TwitterApi;  // OAuth 1.0a client for write/stream operations
  private streamClient?: TweetStream<TweetV2SingleStreamResult>;
  private autoReconnect: boolean = true;
  private autoReconnectRetries: number = 5;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private readonly reconnectDelay: number = 5000;
  private processedTweetCount: number = 0;
  private readonly maxTweetsToProcess: number = 100;
  private totalTokenCount: number = 0;
  private readonly maxTokenCount: number = 60000;

  private countTokens(text: string): number {
    // Simple token counting - approximately 4 chars per token
    return Math.ceil(text.length / 4);
  }

  constructor(readClient: TwitterApi, writeClient: TwitterApi) {
    super();
    this.readClient = readClient;
    this.writeClient = writeClient;
  }

  async setupStreamRules() {
    try {
      // Delete existing rules
      const rules = await this.writeClient.v2.streamRules();
      if (rules.data?.length) {
        await this.writeClient.v2.updateStreamRules({
          delete: { ids: rules.data.map(rule => rule.id) }
        });
      }

      // Add new rules to track mentions and specific commands
      await this.writeClient.v2.updateStreamRules({
        add: [
          { value: '@XAIAgentAI -is:retweet', tag: 'mentions' },
          { value: '@XAIAgentAI (create token OR 创建代币) -is:retweet', tag: 'token_creation' },
          { value: '@XAIAgentAI (create bot OR 创建机器人) -is:retweet', tag: 'bot_creation' },
          { value: '@XAIAgentAI (create virtual OR 创建虚拟人) -is:retweet', tag: 'virtual_creation' },
          { value: '@XAIAgentAI (create agent OR 创建代理) -is:retweet', tag: 'agent_creation' }
        ]
      });
    } catch (error) {
      console.error('Error setting up stream rules:', error);
      throw error;
    }
  }

  async startStream() {
    try {
      // Reset counters on stream start
      this.processedTweetCount = 0;
      this.totalTokenCount = 0;
      await this.setupStreamRules();

      this.streamClient = await this.writeClient.v2.searchStream({
        'tweet.fields': ['author_id', 'created_at', 'text', 'referenced_tweets', 'in_reply_to_user_id'],
        'user.fields': ['username', 'name', 'profile_image_url'],
        expansions: ['author_id', 'referenced_tweets.id', 'in_reply_to_user_id']
      });

      console.log('[StreamService] Stream connected successfully');
      
      // Log stream rules for verification
      const rules = await this.writeClient.v2.streamRules();
      console.log('[StreamService] Active stream rules:', JSON.stringify(rules.data, null, 2));
      console.log('[StreamService] Stream configuration:', {
        fields: {
          tweet: ['author_id', 'created_at', 'text', 'referenced_tweets', 'in_reply_to_user_id'],
          user: ['username', 'name', 'profile_image_url']
        },
        expansions: ['author_id', 'referenced_tweets.id', 'in_reply_to_user_id']
      });

      // Enable auto reconnect with retries
      this.streamClient.autoReconnect = this.autoReconnect;
      this.streamClient.autoReconnectRetries = this.autoReconnectRetries;

      // Setup event handlers
      this.streamClient.on(ETwitterStreamEvent.ConnectionError, err => {
        console.error('[StreamService] Connection error:', err);
        this.handleStreamError();
      });

      this.streamClient.on(ETwitterStreamEvent.ConnectionClosed, () => {
        console.log('[StreamService] Connection closed');
      });

      this.streamClient.on(ETwitterStreamEvent.ReconnectError, (retryAttempt) => {
        console.error(`[StreamService] Reconnection attempt ${retryAttempt} failed`);
      });

      this.streamClient.on(ETwitterStreamEvent.ReconnectLimitExceeded, () => {
        console.error('[StreamService] Reconnection limit exceeded');
        this.handleStreamError();
      });

      try {
        for await (const tweet of this.streamClient) {
          // Stop processing after reaching max tweets
          if (this.processedTweetCount >= this.maxTweetsToProcess) {
            console.log(`[StreamService] Reached maximum tweet limit (${this.maxTweetsToProcess}). Waiting for new session.`);
            continue;
          }

          // Skip retweets
          if (tweet.data.referenced_tweets?.some((ref: { type: string }) => ref.type === 'retweeted')) {
            continue;
          }

          // Count tokens in the tweet
          const tweetTokens = this.countTokens(tweet.data.text);
          
          // Check token limit
          if (this.totalTokenCount + tweetTokens > this.maxTokenCount) {
            console.log(`[StreamService] Reached maximum token limit (${this.maxTokenCount}). Waiting for new session.`);
            continue;
          }

          // Increment counters for original tweets
          this.processedTweetCount++;
          this.totalTokenCount += tweetTokens;

        const user = tweet.includes?.users?.find((u: { id: string; username: string; name: string; profile_image_url?: string }) => u.id === tweet.data.author_id);
        if (!user) {
          console.error('User data not found in tweet:', tweet);
          continue;
        }

        const accountData: XAccountData = {
          id: user.id, // Add id at the root level
          profile: {
            username: user.username,
            name: user.name,
            profileImageUrl: user.profile_image_url,
            id: user.id
          },
          mentionText: tweet.data.text,
          tweetId: tweet.data.id,
          tweets: [] // Will be populated by xService when needed
        };

        const mentionEvent: XMentionEvent = {
          type: 'mention',
          data: accountData
        };

        this.emit('mention', mentionEvent);
        }
      } catch (error) {
        console.error('[StreamService] Error in stream processing:', error);
        this.handleStreamError();
      }
    } catch (error) {
      console.error('[StreamService] Stream error:', error);
      if (error instanceof Error) {
        console.error('[StreamService] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      this.handleStreamError();
    }
  }

  private async handleStreamError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(async () => {
        try {
          await this.startStream();
          this.reconnectAttempts = 0;
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('error', new Error('Stream connection failed'));
    }
  }

  async stopStream() {
    if (this.streamClient) {
      try {
        // Close the stream connection
        await this.streamClient.close();
        this.streamClient = undefined;
        console.log('[StreamService] Stream closed successfully');
      } catch (error) {
        console.error('[StreamService] Error closing stream:', error);
        // Force cleanup even if close fails
        this.streamClient = undefined;
      }
    }
  }
}

// Export setup function that creates and initializes stream service
export async function setupStreamService(): Promise<StreamService> {
  // Initialize with OAuth 2.0 Bearer Token for v2 API access
  console.log('[StreamService] Initializing with OAuth 2.0 Bearer Token...');
  
  try {
    // Verify required environment variables
    const requiredEnvVars = [
      'TWITTER_BEARER_TOKEN',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_TOKEN_SECRET',
      'TWITTER_CONSUMER_KEY',
      'TWITTER_CONSUMER_SECRET'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }
    
    // Create OAuth 1.0a client for streaming and write operations
    const writeClient = new TwitterApi({
      appKey: process.env.TWITTER_CONSUMER_KEY!,
      appSecret: process.env.TWITTER_CONSUMER_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!
    });
    
    // Create read-only client with Bearer Token for v2 endpoints
    const readClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN!);
    console.log('[StreamService] Twitter API clients created');
    
    const streamService = new StreamService(readClient, writeClient);
    
    // Test API access before starting stream
    try {
      console.log('[StreamService] Testing API access...');
      const user = await writeClient.v2.me();
      console.log('[StreamService] API access verified. User:', {
        id: user.data.id,
        name: user.data.name,
        username: user.data.username
      });
    } catch (apiError) {
      const errorDetails = {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        code: (apiError as any)?.code || 'UNKNOWN',
        data: (apiError as any)?.data || null
      };
      console.error('[StreamService] API access test failed:', errorDetails);
      throw apiError;
    }
    
    // Test stream rules before starting
    try {
      console.log('[StreamService] Testing stream rules...');
      const rules = await writeClient.v2.streamRules();
      console.log('[StreamService] Current stream rules:', rules.data || []);
    } catch (rulesError) {
      const errorDetails = {
        error: rulesError instanceof Error ? rulesError.message : 'Unknown error',
        code: (rulesError as any)?.code || 'UNKNOWN',
        data: (rulesError as any)?.data || null
      };
      console.error('[StreamService] Stream rules test failed:', errorDetails);
      throw rulesError;
    }
    
    await streamService.startStream();
    return streamService;
  } catch (error) {
    console.error('[StreamService] Service initialization error:', error);
    if (error instanceof Error) {
      console.error('[StreamService] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}
