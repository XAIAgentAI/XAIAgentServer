import { TwitterApi } from 'twitter-api-v2';

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
            userTimeline: async () => ({ data: { data: [] } })
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
}

export default TwitterClient;
