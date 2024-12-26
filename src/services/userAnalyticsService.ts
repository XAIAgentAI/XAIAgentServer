import { UserAnalytics, AnalysisType, AnalysisRecord, AnalysisResponse, PaymentError } from '../types';

// Temporary in-memory storage until database integration
export const userAnalyticsService = {
  getOrCreateUserAnalytics,
  recordAnalysis,
  recordSuccessfulPayment
};
const userAnalyticsStore: Map<string, UserAnalytics> = new Map();

/**
 * Get or create user analytics record
 * @param userId User's X account ID
 * @returns UserAnalytics object
 */
async function getOrCreateUserAnalytics(userId: string): Promise<UserAnalytics> {
  const existing = userAnalyticsStore.get(userId);
  if (existing) {
    return existing;
  }

  // Initialize new user with 5 free matching uses
  const newAnalytics: UserAnalytics = {
    userId,
    freeMatchingUsesLeft: 5,
    totalMatchingAnalyses: 0,
    lastAnalysisDate: new Date().toISOString(),
    analysisHistory: []
  };

  userAnalyticsStore.set(userId, newAnalytics);
  return newAnalytics;
}

/**
 * Record a new analysis attempt and handle payment requirements
 * @param userId User's X account ID
 * @param analysisType Type of analysis (personal or matching)
 * @param targetUserId Optional target user for matching analysis
 * @returns Analysis response with payment requirements if needed
 */
async function recordAnalysis(
  userId: string,
  analysisType: AnalysisType,
  targetUserId?: string
): Promise<AnalysisResponse> {
  const analytics = await getOrCreateUserAnalytics(userId);
  const timestamp = new Date().toISOString();

  // Personal analysis is always free
  if (analysisType === 'personal') {
    const record: AnalysisRecord = {
      type: analysisType,
      timestamp,
      usedFreeCredit: false
    };
    analytics.analysisHistory.push(record);
    analytics.lastAnalysisDate = timestamp;
    userAnalyticsStore.set(userId, analytics);
    
    return {
      success: true,
      paymentRequired: false
    };
  }

  // Handle matching analysis
  if (analytics.freeMatchingUsesLeft > 0) {
    // Use a free credit
    const record: AnalysisRecord = {
      type: analysisType,
      timestamp,
      targetUserId,
      usedFreeCredit: true
    };
    
    analytics.freeMatchingUsesLeft--;
    analytics.totalMatchingAnalyses++;
    analytics.analysisHistory.push(record);
    analytics.lastAnalysisDate = timestamp;
    userAnalyticsStore.set(userId, analytics);

    return {
      success: true,
      paymentRequired: false,
      freeUsesLeft: analytics.freeMatchingUsesLeft
    };
  }

  // Require XAA payment for matching analysis when no free uses left
  return {
    success: true,
    paymentRequired: true,
    freeUsesLeft: 0
  };
}

/**
 * Record a successful XAA payment and complete the analysis
 * @param userId User's X account ID
 * @param targetUserId Target user for matching analysis
 * @returns Success status
 */
async function recordSuccessfulPayment(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  const analytics = await getOrCreateUserAnalytics(userId);
  const timestamp = new Date().toISOString();

  const record: AnalysisRecord = {
    type: 'matching',
    timestamp,
    targetUserId,
    usedFreeCredit: false
  };

  analytics.totalMatchingAnalyses++;
  analytics.analysisHistory.push(record);
  analytics.lastAnalysisDate = timestamp;
  userAnalyticsStore.set(userId, analytics);

  return true;
}
