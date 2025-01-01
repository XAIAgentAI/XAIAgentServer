import { TwitterApi, TweetV2, TwitterApiv2 } from 'twitter-api-v2';

class TwitterClient {
  private static instance: TwitterApi;
  private static mockMode: boolean = process.env.NODE_ENV === 'test';

  private constructor() {}

  public static async getInstance(): Promise<TwitterApi> {
    if (!TwitterClient.instance) {
      if (TwitterClient.mockMode) {
        // Mock instance for testing
        TwitterClient.instance = {
          v2: {
            tweet: async (text: string) => ({ data: { id: 'mock-tweet-id' } }),
            reply: async (text: string, reply_to: string) => ({ data: { id: 'mock-reply-id' } }),
            userByUsername: async (username: string) => ({
              data: {
                id: 'mock-user-id',
                username: username,
                name: 'Mock User',
                profile_image_url: 'https://example.com/mock-profile.jpg'
              }
            }),
            userTimeline: async (userId: string) => ({
              data: {
                data: [
                  {
                    id: 'mock-tweet-1',
                    text: 'Mock tweet 1',
                    created_at: new Date().toISOString(),
                    referenced_tweets: []
                  }
                ],
                includes: {
                  users: [{
                    id: userId,
                    username: 'mock_user',
                    name: 'Mock User',
                    profile_image_url: 'https://example.com/mock-profile.jpg',
                    description: 'Mock user description',
                    public_metrics: {
                      followers_count: 100,
                      following_count: 50
                    }
                  }],
                  media: []
                }
              }
            })
          }
        } as any;
      } else {
        // Real Twitter API instance
        if (!process.env.TWITTER_BEARER_TOKEN) {
          throw new Error('Twitter API credentials not found in environment variables');
        }
        
        TwitterClient.instance = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
      }
    }

    return TwitterClient.instance;
  }

  public static async postResponse(text: string, replyToTweetId?: string): Promise<{ tweetId: string }> {
    const client = await TwitterClient.getInstance();
    try {
      if (replyToTweetId) {
        const response = await client.v2.reply(text, replyToTweetId);
        return { tweetId: response.data.id };
      } else {
        const response = await client.v2.tweet(text);
        return { tweetId: response.data.id };
      }
    } catch (error) {
      console.error('Error posting Twitter response:', error);
      throw new Error('Failed to post response to Twitter');
    }
  }

  public static async waitForReply(tweetId: string, timeout: number): Promise<TweetV2 | null> {
    const client = await TwitterClient.getInstance();
    const startTime = Date.now();

    try {
      if (TwitterClient.mockMode) {
        // Mock implementation for testing
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          id: 'mock-reply-id',
          text: 'yes',
          author_id: 'mock-author-id',
          created_at: new Date().toISOString()
        } as TweetV2;
      }

      while (Date.now() - startTime < timeout) {
        // Search for replies to the tweet
        const replies = await client.v2.search(`conversation_id:${tweetId}`, {
          expansions: ['referenced_tweets.id', 'author_id', 'in_reply_to_user_id'],
          'tweet.fields': ['author_id', 'in_reply_to_user_id', 'referenced_tweets', 'conversation_id']
        });
        
        // Check each tweet in the response
        for (const tweet of replies.tweets) {
          const referencedTweet = tweet.referenced_tweets?.[0];
          if (referencedTweet?.type === 'replied_to' && 
              referencedTweet.id === tweetId &&
              tweet.author_id === tweet.in_reply_to_user_id) {
            return tweet;
          }
        }

        // If no valid reply found in this batch, check if there are more results
        if (!replies.meta.next_token) {
          // No more results, wait before next search
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        // Wait 10 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      // Timeout reached
      return null;
    } catch (error) {
      console.error('Error waiting for Twitter reply:', error);
      throw new Error('Failed to fetch Twitter replies');
    }
  }
}

export default TwitterClient;
