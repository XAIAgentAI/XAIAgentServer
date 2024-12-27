// Mock TwitterClient for testing
class TwitterClient {
  private static instance: any;

  private constructor() {}

  public static async getInstance(): Promise<any> {
    if (!TwitterClient.instance) {
      TwitterClient.instance = {
        getTweetApi: () => ({
          getUserTweets: async () => ({
            data: {
              data: []
            }
          })
        })
      };
    }

    return TwitterClient.instance;
  }
}

export default TwitterClient;
