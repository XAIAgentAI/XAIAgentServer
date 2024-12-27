import { AIAgent } from './index';

export interface TwitterUser {
  screenName: string;
  name: string;
  profileImageUrl: string;
  description: string;
  followersCount: number;
  friendsCount: number;
  location: string;
}

export interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  user: TwitterUser;
  images: string[];
  videos: string[];
  url: string;
  tokenCount?: number;
}

export interface TweetFetchResult {
  tweets: Tweet[];
  error?: string;
}

export interface AgentTweetUpdate {
  agentId: string;
  tweets: Tweet[];
  lastFetchTime: string;
}
