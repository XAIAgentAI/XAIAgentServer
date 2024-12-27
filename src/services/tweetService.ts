import { Tweet, TweetFetchResult, AgentTweetUpdate } from '../types/twitter.js';
import { AIAgent } from '../types/index.js';
import TwitterClient from './twitterClient.js';
import { getUserAgentAccounts } from './aiAgentService.js';
import lodash from 'lodash';
import dayjsLib from 'dayjs';
const { get } = lodash;
const dayjs = dayjsLib;

export class TweetService {
  // Public method for testing tweet processing
  public async testProcessTweets(tweets: Tweet[]): Promise<{ tweets: Tweet[]; totalTokens: number }> {
    const processedTweets = this.processTweets(tweets);
    const totalTokens = this.calculateTotalTokens(processedTweets);
    return { tweets: processedTweets, totalTokens };
  }
  private client: any; // Will be properly typed once we have XAuthClient implementation

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      this.client = await TwitterClient.getInstance();
    } catch (error) {
      console.error('Failed to initialize Twitter client:', error);
      // Return mock client for testing
      this.client = {
        v2: {
          userByUsername: async () => ({
            data: { id: 'mock_user_id' }
          }),
          userTimeline: async () => ({
            data: {
              data: [],
              includes: {
                users: [{
                  id: 'mock_user_id',
                  username: 'mock_user',
                  name: 'Mock User',
                  profile_image_url: 'https://example.com/image.jpg',
                  description: 'Mock description',
                  public_metrics: {
                    followers_count: 100,
                    following_count: 50
                  }
                }]
              }
            }
          })
        }
      };
    }
  }

  public async fetchTweetsForAgentAccounts(): Promise<AgentTweetUpdate[]> {
    const updates: AgentTweetUpdate[] = [];
    
    try {
      const agents = await getUserAgentAccounts();
      
      for (const agent of agents) {
        try {
          const tweets = await this.fetchUserTweets(agent.xHandle || agent.xAccountId);
          updates.push({
            agentId: agent.xAccountId,
            tweets,
            lastFetchTime: dayjs().toISOString()
          });
        } catch (error) {
          console.error(`Error fetching tweets for ${agent.xHandle || agent.xAccountId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error fetching AI agents:', error);
    }

    return updates;
  }

  public async fetchUserTweets(userHandle: string): Promise<Tweet[]> {
    try {
      console.log(`Fetching tweets for user: ${userHandle}`);
      // First get the user ID from the username
      const userResponse = await this.client.v2.userByUsername(userHandle);
      if (!userResponse?.data?.id) {
        throw new Error(`User not found: ${userHandle}`);
      }

      const userId = userResponse.data.id;
      const response = await this.client.v2.userTimeline(userId, {
        max_results: 100,
        'tweet.fields': ['created_at', 'text', 'referenced_tweets'],
        'user.fields': ['name', 'username', 'profile_image_url', 'description', 'public_metrics'],
        'media.fields': ['url', 'preview_image_url', 'type'],
        'expansions': ['author_id', 'attachments.media_keys']
      });

      if (!response?.data?.data) {
        return [];
      }

      const tweets = response.data.data;
      const users = response.includes?.users || [];
      const user = users[0];
      const media = response.includes?.media || [];
      
      console.log('Raw tweets data:', JSON.stringify(tweets, null, 2));
      console.log('Users data:', JSON.stringify(users, null, 2));
      console.log('Media data:', JSON.stringify(media, null, 2));

      return this.processTweets(tweets.map((tweet: any) => ({
        ...tweet,
        user: user ? {
          screenName: user.username,
          name: user.name,
          profileImageUrl: user.profile_image_url,
          description: user.description,
          followersCount: user.public_metrics?.followers_count,
          friendsCount: user.public_metrics?.following_count
        } : undefined,
        media: media.filter((m: any) => tweet.attachments?.media_keys?.includes(m.media_key))
      })));
    } catch (error: any) {
      console.error(`Error fetching tweets for user ${userHandle}:`, error);
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        throw new Error('Twitter API rate limit exceeded. Please try again later.');
      }
      if (error.code === 'ENOTFOUND') {
        throw new Error('Network error: Unable to connect to Twitter API');
      }
      if (error.code === 'UNAUTHORIZED') {
        throw new Error('Twitter API authentication failed. Please check your credentials.');
      }
      throw new Error(`Failed to fetch tweets: ${error.message}`);
    }
  }

  private countTokensInTweet(text: string): number {
    // Split on whitespace and punctuation, filter out empty strings
    return text.split(/[\s,.!?;:'"()\[\]{}|\\/<>]+/)
      .filter(token => token.length > 0)
      .length;
  }

  private calculateTotalTokens(tweets: Tweet[]): number {
    return tweets.reduce((total, tweet) => total + (tweet.tokenCount || 0), 0);
  }

  // Made protected for testing purposes
  protected processTweets(tweets: any[]): Tweet[] {
    try {
      // First filter and map tweets
      if (!Array.isArray(tweets)) {
        console.warn('processTweets received non-array input:', tweets);
        return [];
      }

      let processedTweets = tweets
        .filter((tweet: any) => {
          // Filter out retweets and quotes
          const isRetweet = tweet.referenced_tweets?.some((ref: any) => ref.type === 'retweeted') || false;
          const isQuote = tweet.referenced_tweets?.some((ref: any) => ref.type === 'quoted') || false;
          return !isRetweet && !isQuote && !tweet.text?.startsWith('RT @');
        })
        .map((tweet: any) => {
          const images = tweet.media
            ?.filter((media: any) => media.type === 'photo')
            .map((media: any) => media.url) || [];

          const videos = tweet.media
            ?.filter((media: any) => media.type === 'video' || media.type === 'animated_gif')
            .map((media: any) => media.url)
            .filter(Boolean) || [];

        return {
          id: tweet.id,
          text: tweet.text || '',
          createdAt: tweet.created_at,
          user: tweet.user,
          images,
          videos,
          url: `https://x.com/${tweet.user?.screenName || 'unknown'}/status/${tweet.id}`,
          tokenCount: this.countTokensInTweet(tweet.text || '')
        };
      });

    // Calculate total tokens and truncate if needed
    let totalTokens = 0;
    const maxTokens = 60000;
    
    // Keep only tweets that fit within the token limit
    processedTweets = processedTweets.filter(tweet => {
      const newTotal = totalTokens + (tweet.tokenCount || 0);
      if (newTotal <= maxTokens) {
        totalTokens = newTotal;
        return true;
      }
      return false;
    });

    return processedTweets;
    } catch (error: any) {
      console.error('Error processing tweets:', error);
      if (error.message?.includes('token limit')) {
        throw new Error('Tweet data exceeds maximum token limit of 60,000.');
      }
      if (error.message?.includes('invalid tweet format')) {
        throw new Error('Invalid tweet format encountered during processing.');
      }
      throw new Error(`Failed to process tweets: ${error.message}`);
    }
  }
}

export const tweetService = new TweetService();
