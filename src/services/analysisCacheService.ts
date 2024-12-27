import { 
  PersonalAnalysisResult, 
  MatchingAnalysisResult, 
  AnalysisResponse,
  AnalysisType
} from '../types/index.js';

interface AnalysisCache {
  userId: string;
  analysisType: 'personal' | 'matching';
  targetUserId?: string;
  results: PersonalAnalysisResult | MatchingAnalysisResult;
  timestamp: Date;
  expiresAt: Date;
}

// In-memory cache for development. In production, this should use Redis or similar
const analysisCache = new Map<string, AnalysisCache>();

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHE_SIZE = 1000; // Maximum number of cached items

/**
 * Generate a cache key for an analysis request
 */
function generateCacheKey(userId: string, analysisType: 'personal' | 'matching', targetUserId?: string): string {
  return `${userId}:${analysisType}${targetUserId ? `:${targetUserId}` : ''}`;
}

/**
 * Clean expired cache entries
 */
function cleanExpiredCache(): void {
  const now = new Date();
  for (const [key, value] of analysisCache.entries()) {
    if (value.expiresAt < now) {
      analysisCache.delete(key);
    }
  }
}

/**
 * Get cached analysis results
 */
function getCachedAnalysis(
  userId: string,
  analysisType: 'personal' | 'matching',
  targetUserId?: string
): AnalysisResponse<PersonalAnalysisResult | MatchingAnalysisResult> {
  const key = generateCacheKey(userId, analysisType, targetUserId);
  const cached = analysisCache.get(key);

  if (!cached || cached.expiresAt < new Date()) {
    if (cached) {
      analysisCache.delete(key);
    }
    return {
      success: false,
      error: 'ANALYSIS_ERROR',
      paymentRequired: false,
      freeUsesLeft: 5
    };
  }

  return {
    success: true,
    data: cached.results,
    paymentRequired: false,
    freeUsesLeft: 5
  };
}

/**
 * Cache analysis results
 */
function cacheAnalysis(
  userId: string,
  analysisType: 'personal' | 'matching',
  results: PersonalAnalysisResult | MatchingAnalysisResult,
  targetUserId?: string
): void {
  // Clean expired entries if cache is full
  if (analysisCache.size >= MAX_CACHE_SIZE) {
    cleanExpiredCache();
    
    // If still full, remove oldest entries
    if (analysisCache.size >= MAX_CACHE_SIZE) {
      const entries = Array.from(analysisCache.entries());
      entries.sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
      const entriesToRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2)); // Remove oldest 20%
      entriesToRemove.forEach(([key]) => analysisCache.delete(key));
    }
  }

  const key = generateCacheKey(userId, analysisType, targetUserId);
  const now = new Date();
  
  analysisCache.set(key, {
    userId,
    analysisType,
    targetUserId,
    results,
    timestamp: now,
    expiresAt: new Date(now.getTime() + CACHE_DURATION)
  });
}

// Periodically clean expired cache entries
setInterval(cleanExpiredCache, 60 * 60 * 1000); // Clean every hour

export const analysisCacheService = {
  getCachedAnalysis,
  cacheAnalysis
};

export { getCachedAnalysis, cacheAnalysis };
