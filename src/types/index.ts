export interface XAccountData {
  id: string;
  username: string;
  tweets: string[];
}

export interface AIAgent {
  id: string;
  xAccountId: string;
  personality: PersonalityAnalysis;
  createdAt: string;
}

export interface PersonalityAnalysis {
  traits: string[];
  interests: string[];
  description: string;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  logo?: string;
}

export interface Token {
  address: string;
  name: string;
  symbol: string;
  creatorAddress: string;
}
