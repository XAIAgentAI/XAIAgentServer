import { TwitterApi, TweetStream, TweetV2SingleStreamResult, ETwitterStreamEvent } from 'twitter-api-v2';
import { EventEmitter } from 'events';
import { XMentionEvent } from '../types/events.js';
import { XAccountData } from '../types/twitter.js';

export class StreamService extends EventEmitter {
  private client: TwitterApi;
  private streamClient?: TweetStream<TweetV2SingleStreamResult>;
  private autoReconnect: boolean = true;
  private autoReconnectRetries: number = 5;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private readonly reconnectDelay: number = 5000;

  constructor(client: TwitterApi) {
    super();
    this.client = client;
  }

  async setupStreamRules() {
    try {
      // Delete existing rules
      const rules = await this.client.v2.streamRules();
      if (rules.data?.length) {
        await this.client.v2.updateStreamRules({
          delete: { ids: rules.data.map(rule => rule.id) }
        });
      }

      // Add new rules to track mentions and specific commands
      await this.client.v2.updateStreamRules({
        add: [
          { value: '@XAIAgentAI', tag: 'mentions' },
          { value: '@XAIAgentAI create token OR 创建代币', tag: 'token_creation' },
          { value: '@XAIAgentAI create bot OR 创建机器人', tag: 'bot_creation' },
          { value: '@XAIAgentAI create virtual OR 创建虚拟人', tag: 'virtual_creation' },
          { value: '@XAIAgentAI create agent OR 创建代理', tag: 'agent_creation' }
        ]
      });
    } catch (error) {
      console.error('Error setting up stream rules:', error);
      throw error;
    }
  }

  async startStream() {
    try {
      await this.setupStreamRules();

      this.streamClient = await this.client.v2.searchStream({
        'tweet.fields': ['author_id', 'created_at', 'text', 'referenced_tweets', 'in_reply_to_user_id'],
        'user.fields': ['username', 'name', 'profile_image_url'],
        expansions: ['author_id', 'referenced_tweets.id', 'in_reply_to_user_id']
      });

      console.log('[StreamService] Stream connected successfully');
      
      // Log stream rules for verification
      const rules = await this.client.v2.streamRules();
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
        // Skip retweets
        if (tweet.data.referenced_tweets?.some((ref: { type: string }) => ref.type === 'retweeted')) {
          continue;
        }

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
  // Use Bearer Token authentication for read-only operations
  const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN!);

  const streamService = new StreamService(client);
  await streamService.startStream();
  return streamService;
}
