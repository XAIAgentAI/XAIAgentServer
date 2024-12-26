import { TwitterApi } from 'twitter-api-v2';

class TwitterClient {
  private static instance: TwitterApi;

  private constructor() {}

  public static async getInstance(): Promise<TwitterApi> {
    if (!TwitterClient.instance) {
      if (!process.env.TWITTER_BEARER_TOKEN) {
        throw new Error('TWITTER_BEARER_TOKEN environment variable is not set');
      }

      TwitterClient.instance = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
    }

    return TwitterClient.instance;
  }
}

export default TwitterClient;
