import { Tweet, TweetFetchResult, AgentTweetUpdate } from '../types/twitter';
import { AIAgent } from '../types/index';
import TwitterClient from './twitterClient';
import { getUserAgentAccounts } from './aiAgentService';
import { get } from 'lodash';
import dayjs from 'dayjs';

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
      throw error;
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

  private async fetchUserTweets(userHandle: string): Promise<Tweet[]> {
    try {
      const response = await this.client.getTweetApi().getUserTweets({
        userId: userHandle,
        count: 100
      });

      return this.processTweets(response.data.data);
    } catch (error) {
      console.error(`Error fetching tweets for user ${userHandle}:`, error);
      throw error;
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
    // First filter and map tweets
    let processedTweets = tweets
      .filter(tweet => {
        // Filter out retweets and quotes
        const isRetweet = !tweet.referenced_tweets || tweet.referenced_tweets.length === 0;
        const isQuoteStatus = get(tweet, 'raw.result.legacy.isQuoteStatus');
        const fullText = get(tweet, 'raw.result.legacy.fullText', '');
        
        return !isRetweet && !isQuoteStatus && !fullText.includes('RT @');
      })
      .map(tweet => {
        const user = {
          screenName: get(tweet, 'user.legacy.screenName'),
          name: get(tweet, 'user.legacy.name'),
          profileImageUrl: get(tweet, 'user.legacy.profileImageUrlHttps'),
          description: get(tweet, 'user.legacy.description'),
          followersCount: get(tweet, 'user.legacy.followersCount'),
          friendsCount: get(tweet, 'user.legacy.friendsCount'),
          location: get(tweet, 'user.legacy.location')
        };

        const mediaItems = get(tweet, 'raw.result.legacy.extendedEntities.media', []);
        const images = mediaItems
          .filter((media: any) => media.type === 'photo')
          .map((media: any) => media.mediaUrlHttps);

        const videos = mediaItems
          .filter((media: any) => media.type === 'video' || media.type === 'animated_gif')
          .map((media: any) => {
            const variants = get(media, 'videoInfo.variants', []);
            const bestQuality = variants
              .filter((v: any) => v.contentType === 'video/mp4')
              .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            return bestQuality?.url;
          })
          .filter(Boolean);

        return {
          id: get(tweet, 'raw.result.legacy.idStr'),
          text: get(tweet, 'raw.result.legacy.fullText'),
          createdAt: get(tweet, 'raw.result.legacy.createdAt'),
          user,
          images,
          videos,
          url: `https://x.com/${user.screenName}/status/${get(tweet, 'raw.result.legacy.idStr')}`,
          tokenCount: this.countTokensInTweet(get(tweet, 'raw.result.legacy.fullText', ''))
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
  }
}

export const tweetService = new TweetService();
