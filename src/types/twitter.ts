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

export interface TwitterAPIError extends Error {
  retryAfter?: number;
  code?: string;
  status?: number;
}

export interface AgentTweetUpdate {
  agentId: string;
  tweets: Tweet[];
  lastFetchTime: string;
}

export interface XAccountData {
  id: string;
  username: string;
  name: string;
  mentionText?: string;
  description?: string;
  profileImageUrl?: string;
  followersCount?: number;
  followingCount?: number;
  tweetCount?: number;
  createdAt?: string;
  lastTweetAt?: string;
  tweetId?: string;  // ID of the tweet that mentioned @XAIAgentAI
}
