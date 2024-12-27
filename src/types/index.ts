// X Account Data Types
export interface XTweet {
  id: string;
  text: string;
  createdAt: string;
}

export interface XProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  metrics: {
    followers: number;
    following: number;
    tweets: number;
  };
}

export enum MentionType {
  TOKEN_CREATION = 'TOKEN_CREATION',
  QUESTION = 'QUESTION'
}

export interface XAccountData {
  id: string;
  profile: XProfile;
  tweets: XTweet[];
  mentionText?: string;
}

// AI Agent Types
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
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  timestamp: string;
  version: number;
}

export interface Token {
  address: string;
  name: string;
  symbol: string;
  creatorAddress: string;
  totalSupply: string;
  initialPriceUSD: number;
  poolAddress?: string;
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

export interface PersonalAnalysisResult {
  personalityTraits: Record<string, number>;
  interests: string[];
  writingStyle: Record<string, number>;
  topicPreferences: string[];
}

export interface MatchingAnalysisResult extends PersonalAnalysisResult {
  matchScore: number;
  commonInterests: string[];
  compatibilityDetails: {
    values: number;
    communication: number;
    interests: number;
  };
  success?: boolean;
  error?: string;
  paymentRequired?: boolean;
}

export type PaymentError = 
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'NETWORK_ERROR'
  | 'TRANSACTION_FAILED'
  | 'CONTRACT_ERROR'
  | 'ANALYSIS_ERROR';

export interface AnalysisResponse<T = PersonalAnalysisResult | MatchingAnalysisResult> {
  success: boolean;
  data?: T;
  error?: PaymentError;
  paymentRequired?: boolean;
  freeUsesLeft?: number;
  transactionHash?: string;
  matchScore?: number;
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
  error?: string;
  timestamp: string;
}
