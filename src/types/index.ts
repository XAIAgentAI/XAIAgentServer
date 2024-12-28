import { XAccountData } from './twitter.js';

// X Account Data Types
export interface XTweet {
  id: string;
  text: string;
  createdAt: string;
}

export interface XProfile {
  username: string;
  name: string;
  description?: string;
  profileImageUrl?: string;
  followersCount?: number;
  followingCount?: number;
  tweetCount?: number;
  createdAt?: string;
  lastTweetAt?: string;
}

export enum MentionType {
  TOKEN_CREATION = 'TOKEN_CREATION',
  QUESTION = 'QUESTION',
  EMPTY = 'EMPTY'  // For direct mentions without content
}

// AI Agent Types
export interface AIService {
  createAIAgent: (xAccountData: XAccountData) => Promise<AIAgent>;
  answerQuestion: (question: string, agent: AIAgent) => Promise<string>;
  analyzePersonality: (accountData: XAccountData, isEmptyMention?: boolean) => Promise<AnalysisResponse<PersonalAnalysisResult>>;
  analyzeMatching: (accountData: XAccountData, targetAccountData: XAccountData) => Promise<AnalysisResponse<MatchingAnalysisResult>>;
  updatePersonality: (agentId: string, personality: PersonalityAnalysis) => Promise<boolean>;
  getAgentById: (id: string) => Promise<AIAgent | null>;
  getAgentByXAccountId: (xAccountId: string) => Promise<AIAgent | null>;
  generateTokenName: (accountData: XAccountData) => Promise<TokenMetadata>;
  generateVideoContent: (prompt: string, agent: AIAgent) => Promise<{ url: string; duration: number; format: string; }>;
  searchAndOrganizeContent: (query: string, agent: AIAgent) => Promise<{ results: string[]; categories: string[]; }>;
}

export interface PersonalityAnalysis {
  mbti: string;
  traits: string[];
  interests: string[];
  values: string[];
  communicationStyle: {
    primary: string;
    strengths: string[];
    weaknesses: string[];
    languages: string[];
  };
  professionalAptitude: {
    industries: string[];
    skills: string[];
    workStyle: string;
  };
  socialInteraction: {
    style: string;
    preferences: string[];
    challenges: string[];
  };
  contentCreation: {
    topics: string[];
    style: string;
    engagement_patterns: string[];
  };
  description: string;
  lastUpdated: string;
}

export interface TrainingDataRequest {
  agentId: string;
  trainingText: string;
}

export interface PersonalityUpdateRequest {
  description: string;
}

import { Request } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    xAccountId?: string;
  };
  body: any;
  params: ParamsDictionary;
}

export interface AIAgent {
  id: string;
  xAccountId: string;
  xHandle: string;  // Adding xHandle for Twitter username
  personality: PersonalityAnalysis;
  createdAt: string;
  lastTrained: string;
  trainingHistory: Array<{
    timestamp: string;
    dataPoints: number;
    improvements: string[];
  }>;
  capabilities: {
    canGenerateVideo: boolean;
    canAnswerQuestions: boolean;
    canSearchContent: boolean;
    apiEnabled: boolean;
  };
  metrics: {
    totalInteractions: number;
    questionsAnswered: number;
    contentGenerated: number;
    searchesPerformed: number;
  };
}

// Token Types
export interface Token {
  address: string;
  name: string;
  symbol: string;
  creatorAddress: string;
  totalSupply: string;
  initialPriceUSD: string;
  poolAddress?: string;
  pendingConfirmation?: boolean;
}

export interface TokenResponse {
  success: boolean;
  data: Token;
  error?: string;
}

export interface DBCSwapPool {
  tokenAddress: string;
  poolAddress: string;
  initialTokenAmount: string;
}

// Analysis Types
export type AnalysisType = 'personal' | 'matching';

export interface AnalysisRecord {
  type: AnalysisType;
  timestamp: string;
  targetUserId?: string;
  usedFreeCredit: boolean;
}

export interface UserAnalytics {
  userId: string;
  freeMatchingUsesLeft: number;
  totalMatchingAnalyses: number;
  lastAnalysisDate: string;
  analysisHistory: AnalysisRecord[];
}

export interface AnalysisRequest {
  userId: string;
  targetUserId?: string;
  analysisType: AnalysisType;
  userAddress?: string; // Wallet address for XAA payments
}

export interface PaymentValidationRequest {
  userId: string;
  amount: number;
  type: 'matching' | 'personality' | 'token';
  analytics?: UserAnalytics;  // Optional analytics for backward compatibility
}

// RateLimitError interface removed as we no longer use rate limiting

export interface MentionResponse {
  type: MentionType;
  token?: Token;
  analysis?: PersonalAnalysisResult;
  message?: string;
  agent?: AIAgent;
  answer?: string;
  pendingConfirmation?: boolean;
  hits?: number;
  cached?: boolean;
  freeUsesLeft?: number;
  paymentRequired?: boolean;
}

export type SystemError = 
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'NETWORK_ERROR'
  | 'TRANSACTION_FAILED'
  | 'CONTRACT_ERROR'
  | 'ANALYSIS_ERROR'
  | 'TOKEN_LIMIT_EXCEEDED'
  | 'ANALYSIS_FAILED'
  | 'AUTHENTICATION_ERROR'
  | 'PAYMENT_ERROR'
  | 'CACHE_ERROR'
  | 'SYSTEM_ERROR'
  | 'TOKEN_CONFIRMATION_TIMEOUT';

export type PaymentError = SystemError;

export interface AnalysisResponse<T = PersonalAnalysisResult | MatchingAnalysisResult> {
  success: boolean;
  data?: T;
  error?: SystemError;
  message?: string;
  paymentRequired?: boolean;
  freeUsesLeft?: number;
  transactionHash?: string;
  matchScore?: number;
  cached?: boolean;
  hits?: number;
  cacheExpiry?: Date;
}

export interface CacheResponse<T = PersonalAnalysisResult | MatchingAnalysisResult> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
}

// API Response Type
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: SystemError;
  timestamp: string;
  message?: string;
  paymentRequired?: boolean;
  freeUsesLeft?: number;
  transactionHash?: string;
  matchScore?: number;
  pendingConfirmation?: boolean;
}

export interface PersonalAnalysisResult {
  mbti: string;
  traits: string[];
  interests: string[];
  values: string[];
  personalityTraits: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  writingStyle: {
    formal: number;
    technical: number;
    friendly: number;
    emotional: number;
  };
  topicPreferences: string[];
  communicationStyle: {
    primary: string;
    strengths: string[];
    weaknesses: string[];
    languages: string[];
  };
  professionalAptitude: {
    industries: string[];
    skills: string[];
    workStyle: string;
  };
  socialInteraction: {
    style: string;
    preferences: string[];
    challenges: string[];
  };
  contentCreation: {
    topics: string[];
    style: string;
    engagement_patterns: string[];
  };
}

export interface MatchingAnalysisResult {
  compatibility: number;
  commonInterests: string[];
  challenges: string[];
  opportunities: string[];
  writingStyle: {
    formal: number;
    technical: number;
    friendly: number;
    emotional: number;
  };
  topicPreferences: string[];
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  totalSupply: string;
  initialPrice: string;
  lockPeriod: number;
  distributionRules: {
    lockedPercentage: number;
    investorPercentage: number;
    minimumInvestment: string;
    targetFDV: string;
  };
  timestamp: string;
  version: number;
  pendingConfirmation?: boolean;
  confirmed?: boolean;
  tweetId?: string;
  userId?: string;
  timeoutId?: NodeJS.Timeout;
  reason?: string;
  error?: SystemError;
  hits?: number;
  freeUsesLeft?: number;
  paymentRequired?: boolean;
  cached?: boolean;
  success?: boolean;
}
