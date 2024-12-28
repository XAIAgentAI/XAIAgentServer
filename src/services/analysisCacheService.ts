import { 
  PersonalAnalysisResult, 
  MatchingAnalysisResult, 
  AnalysisResponse,
  AnalysisType,
  SystemError
} from '../types/index.js';

interface AnalysisCache {
  success: boolean;
  data?: PersonalAnalysisResult | MatchingAnalysisResult;
  error?: SystemError;
  message?: string;
  timeLeft?: number;
  paymentRequired?: boolean;
  freeUsesLeft?: number;
  transactionHash?: string;
  matchScore?: number;
  cached?: boolean;
  hits?: number;
  cacheExpiry?: Date;
  userId: string;
  analysisType: 'personal' | 'matching';
  targetUserId?: string;
  expiresAt: Date;  // Internal field for cache management
}

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

// Redis client interface
type RedisClient = RedisType;

// Redis configuration
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  retryStrategy: (times: number) => number;
  maxRetriesPerRequest: number;
}

const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3
};

// Create mock Redis client for tests
const mockRedisClient = {
  get: async (key: string) => {
    if (key.endsWith(':hits')) {
      const cacheKey = key.replace(':hits', '');
      const cache = analysisCache.get(cacheKey);
      if (!cache) {
        return null; // Let caller handle initialization
      }
      // Return current hits (at least 1)
      const hits = Math.max(1, cache.hits || 1);
      console.log(`Mock Redis: Getting hits for ${cacheKey}: ${hits}`);
      return hits.toString();
    }
    const cache = analysisCache.get(key);
    if (cache) {
      return JSON.stringify({
        ...cache,
        hits: Math.max(1, cache.hits || 1) // Always at least 1
      });
    }
    return null; // Let caller handle initialization
  },
  set: async (key: string, value: string) => {
    if (key.endsWith(':hits')) {
      const cacheKey = key.replace(':hits', '');
      const cache = analysisCache.get(cacheKey);
      if (cache) {
        const hits = parseInt(value);
        console.log(`Mock Redis: Setting hits for ${cacheKey} to ${hits}`);
        cache.hits = hits;
        analysisCache.set(cacheKey, cache);
      }
    }
    return 'OK';
  },
  setnx: async (key: string, value: string) => {
    if (key.endsWith(':hits')) {
      const cacheKey = key.replace(':hits', '');
      const cache = analysisCache.get(cacheKey);
      if (!cache) {
        console.log(`Mock Redis: Setting new hits for ${cacheKey} to 1`);
        // Always initialize with 1 hit
        await mockRedisClient.set(key, '1');
        // Create initial cache entry
        const newCache: AnalysisCache = {
          hits: 1,
          expiresAt: new Date(Date.now() + CACHE_DURATION),
          cacheExpiry: new Date(Date.now() + CACHE_DURATION),
          userId: key.split(':')[0],
          analysisType: key.split(':')[1] as 'personal' | 'matching',
          success: true,
          cached: true,
          paymentRequired: false,
          freeUsesLeft: 5,
          timeLeft: 0
        };
        analysisCache.set(cacheKey, newCache);
        return 1;
      }
      console.log(`Mock Redis: Key ${cacheKey} already exists`);
      return 0;
    }
    return 1;
  },
  incr: async (key: string) => {
    if (key.endsWith(':hits')) {
      const cacheKey = key.replace(':hits', '');
      const cache = analysisCache.get(cacheKey);
      let currentHits = 1; // Always start at 1 for new keys

      // Get current hits value
      const hitsStr = await mockRedisClient.get(key);
      if (hitsStr !== null) {
        currentHits = parseInt(hitsStr);
        if (isNaN(currentHits)) currentHits = 1; // Default to 1 if parse fails
      }

      // Check if this is an empty mention
      const isEmptyMention = cacheKey.includes(':empty:');
      
      // For empty mentions, keep hits at 1, otherwise increment
      const newHits = isEmptyMention ? 1 : currentHits + 1;
      
      // Update hits in Redis and cache
      await mockRedisClient.set(key, newHits.toString());
      if (cache) {
        console.log(`Mock Redis: ${isEmptyMention ? 'Keeping' : 'Incrementing'} hits for ${cacheKey} ${isEmptyMention ? 'at 1' : `from ${currentHits} to ${newHits}`}`);
        cache.hits = newHits;
        cache.freeUsesLeft = isEmptyMention ? 5 : Math.max(0, 5 - newHits);
        cache.paymentRequired = !isEmptyMention && newHits > 5;
        analysisCache.set(cacheKey, cache);
      } else {
        console.log(`Mock Redis: No cache found for ${cacheKey}, setting hits to ${newHits}`);
        const newCache: AnalysisCache = {
          hits: newHits,
          expiresAt: new Date(Date.now() + CACHE_DURATION),
          cacheExpiry: new Date(Date.now() + CACHE_DURATION),
          userId: key.split(':')[0],
          analysisType: key.split(':')[1] as 'personal' | 'matching',
          success: true,
          cached: true,
          paymentRequired: false,
          freeUsesLeft: 5,
          timeLeft: 0
        };
        analysisCache.set(cacheKey, newCache);
      }

      // Set expiry if not already set
      const ttl = await mockRedisClient.ttl(key);
      if (ttl <= 0) {
        await mockRedisClient.expire(key, HITS_EXPIRY);
      }

      return newHits;
    }
    return 1;
  },
  expire: async (key: string, seconds: number) => {
    const cache = analysisCache.get(key);
    if (cache) {
      cache.expiresAt = new Date(Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  },
  del: async (...args: any[]) => {
    const key = args[0];
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
    const result = analysisCache.delete(key) ? 1 : 0;
    if (callback) callback(null, result);
    return result;
  },
  ttl: async (key: string) => {
    const cache = analysisCache.get(key);
    if (cache) {
      const now = Date.now();
      const expiresAt = cache.expiresAt.getTime();
      const ttl = Math.max(0, Math.floor((expiresAt - now) / 1000));
      return ttl;
    }
    return -1;
  },
  on(event: string | symbol, listener: (...args: any[]) => void): any {
    if (event === 'error' && listener) {
      listener();
    }
    return mockRedisClient;
  }
};

// Initialize Redis client
let redisClient: any;

// Initialize Redis client
async function initRedis() {
  try {
    if (process.env.NODE_ENV === 'test') {
      console.log('Using mock Redis client for tests');
      redisClient = mockRedisClient;
    } else {
      console.log('Initializing Redis client with config:', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db
      });
      const client = new Redis(redisConfig);
      await client.select(redisConfig.db);
      redisClient = client as unknown as RedisClient;
    }

    // Handle Redis errors
    redisClient.on('error', (err?: Error) => {
      if (process.env.NODE_ENV === 'test') {
        console.log('Mock Redis client error (expected in tests):', err);
      } else {
        console.error('Redis Client Error:', err);
      }
    });
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    // Fallback to mock client in case of initialization failure
    console.log('Falling back to mock Redis client');
    redisClient = mockRedisClient;
  }
}

// Initialize Redis when module loads
initRedis().catch(console.error);

// In-memory cache for development. In production, this should use Redis or similar
const analysisCache = new Map<string, AnalysisCache>();

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHE_SIZE = 1000; // Maximum number of cached items
const HITS_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

/**
 * Generate a cache key for an analysis request
 */
function generateCacheKey(
  userId: string, 
  analysisType: 'personal' | 'matching', 
  targetUserId?: string,
  mentionType?: string,
  tweetId?: string
): string {
  const baseKey = `${userId}:${analysisType}${targetUserId ? `:${targetUserId}` : ''}`;
  if (mentionType === 'EMPTY' && tweetId) {
    return `${baseKey}:empty:${tweetId}`;
  }
  return baseKey;
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

// Clean up expired cache entries periodically
setInterval(cleanExpiredCache, 60 * 60 * 1000); // Clean every hour

/**
 * Get cached analysis results
 */
export async function getCachedAnalysis(
  userId: string,
  analysisType: 'personal' | 'matching',
  targetUserId?: string,
  isEmptyMention: boolean = false,
  tweetId?: string
): Promise<AnalysisResponse<PersonalAnalysisResult | MatchingAnalysisResult>> {
  const key = generateCacheKey(
    userId, 
    analysisType, 
    targetUserId, 
    isEmptyMention ? 'EMPTY' : undefined,
    tweetId
  );
  const hitsKey = `${key}:hits`;
  let hits = 1; // Initialize hits with default value of 1
  
  try {
    // Clean expired entries
    cleanExpiredCache();
    
    // Get cache entry and current hits
    const cached = analysisCache.get(key);
    const currentHits = await redisClient.get(hitsKey);
    
    if (!cached || !currentHits) {
      // For new entries, always start at 1
      hits = 1;
      await redisClient.set(hitsKey, '1');
    } else {
      // For existing entries
      const parsedHits = parseInt(currentHits);
      hits = Math.max(1, !isNaN(parsedHits) ? parsedHits : 1);
      
      // Increment hits only on valid cache hit and non-empty mentions
      if (cached.expiresAt > new Date() && !isEmptyMention) {
        hits += 1;
        await redisClient.set(hitsKey, hits.toString());
      }
    }

    // Set expiry if not already set
    const hitsTtl = await redisClient.ttl(hitsKey);
    if (hitsTtl <= 0) {
      await redisClient.expire(hitsKey, HITS_EXPIRY);
    }
    
    // Get cached analysis
    const cachedAnalysis = analysisCache.get(key);
    
    // Return cached analysis with updated hits if valid
    if (cachedAnalysis && cachedAnalysis.expiresAt > new Date()) {
      console.log(`Cache hit for ${key}, hits: ${hits}`);
      
      // Return cached result with updated hits
      const response: AnalysisResponse<PersonalAnalysisResult | MatchingAnalysisResult> = {
        success: true,
        data: cachedAnalysis.data,
        error: cachedAnalysis.error,
        message: cachedAnalysis.message,
        hits,
        cached: true,
        paymentRequired: cachedAnalysis.paymentRequired || false,
        freeUsesLeft: isEmptyMention ? 5 : Math.max(0, 5 - hits)
      };
      
      // Update cache with new hits
      cachedAnalysis.hits = hits;
      analysisCache.set(key, cachedAnalysis);
      
      return response;
    }

    // Handle cache miss or expired entry
    if (cached) {
      analysisCache.delete(key);
    }

    // Create new cache entry with hits starting at 1
    const newEntry: AnalysisCache = {
      success: true,
      data: undefined,
      userId,
      analysisType,
      targetUserId,
      hits: 1, // Always start at 1 for new entries
      cached: false,
      paymentRequired: false,
      freeUsesLeft: 5,
      expiresAt: new Date(Date.now() + CACHE_DURATION),
      cacheExpiry: new Date(Date.now() + CACHE_DURATION),
      timeLeft: 0
    };
    analysisCache.set(key, newEntry);

    // Return response with current hits (always start at 1)
    return {
      success: true,
      data: undefined,
      hits,
      cached: false,
      paymentRequired: false,
      freeUsesLeft: Math.max(0, 5 - hits)
    };
  } catch (error) {
    console.error('Error in getCachedAnalysis:', error);
    // Even in error case, ensure hits start at 1
    return {
      success: false,
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred',
      cached: false,
      hits: 1, // Always start at 1 for error cases too
      paymentRequired: false,
      freeUsesLeft: 5
    };
  }
}

/**
 * Cache analysis results and return the current hits count
 * @param userId - The user ID
 * @param analysisType - The type of analysis ('personal' or 'matching')
 * @param results - The analysis results to cache
 * @param targetUserId - Optional target user ID for matching analysis
 * @returns The current number of hits for this analysis
 */
export async function cacheAnalysis(
  userId: string,
  analysisType: 'personal' | 'matching',
  results: PersonalAnalysisResult | MatchingAnalysisResult,
  targetUserId?: string,
  isEmptyMention: boolean = false,
  tweetId?: string
): Promise<AnalysisResponse<PersonalAnalysisResult | MatchingAnalysisResult>> {
  const key = generateCacheKey(
    userId, 
    analysisType, 
    targetUserId, 
    isEmptyMention ? 'EMPTY' : undefined,
    tweetId
  );
  const hitsKey = `${key}:hits`;
  let hits = 1; // Start at 1 for first request

  try {
    // Clean expired entries if cache is full
    if (analysisCache.size >= MAX_CACHE_SIZE) {
      cleanExpiredCache();
      
      // If still full, remove oldest entries
      if (analysisCache.size >= MAX_CACHE_SIZE) {
        const entries = Array.from(analysisCache.entries());
        entries.sort((a, b) => a[1].expiresAt.getTime() - b[1].expiresAt.getTime());
        const entriesToRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2)); // Remove oldest 20%
        entriesToRemove.forEach(([entryKey]) => analysisCache.delete(entryKey));
      }
    }

    // Get current hits and TTL
    const [hitsStr, ttl] = await Promise.all([
      redisClient.get(hitsKey),
      redisClient.ttl(hitsKey)
    ]);

    if (!hitsStr) {
      // New entry - always start at 1
      hits = 1;
      await redisClient.set(hitsKey, '1');
      console.log(`Initializing hits for ${key} to 1`);
    } else {
      // Existing entry - use current hits (at least 1)
      const parsedHits = parseInt(hitsStr);
      hits = Math.max(1, !isNaN(parsedHits) ? parsedHits : 1);
      
      // Get cached entry to check expiry
      const cached = analysisCache.get(key);
      
      // Handle hits based on mention type
      if (isEmptyMention) {
        hits = 1;
        await redisClient.set(hitsKey, '1');
        console.log(`Empty mention - keeping hits at 1 for ${key}`);
      } else if (cached && cached.expiresAt > new Date()) {
        hits += 1;
        await redisClient.set(hitsKey, hits.toString());
        console.log(`Incrementing hits for ${key} to ${hits}`);
      } else {
        console.log(`Using existing hits for ${key}: ${hits}`);
      }
    }

    // Set expiry if not already set
    if (ttl <= 0) {
      await redisClient.expire(hitsKey, HITS_EXPIRY);
    }

    console.log(`Set hits counter for ${key} to ${hits}`);

    // Create or update cache entry with hits starting at 1
    const now = new Date();
    const cacheEntry: AnalysisCache = {
      success: true,
      userId,
      analysisType,
      targetUserId,
      data: results,
      expiresAt: new Date(now.getTime() + CACHE_DURATION),
      cacheExpiry: new Date(now.getTime() + CACHE_DURATION),
      hits: hits, // Use the hits value we got above
      cached: true,
      paymentRequired: false,
      freeUsesLeft: isEmptyMention ? 5 : Math.max(0, 5 - hits),
      timeLeft: 0
    };
    analysisCache.set(key, cacheEntry);
    
    return {
      success: true,
      data: results,
      hits: isEmptyMention ? 1 : hits,
      cached: true,
      paymentRequired: !isEmptyMention && hits > 5,
      freeUsesLeft: isEmptyMention ? 5 : Math.max(0, 5 - hits)
    };
  } catch (error) {
    console.error('Redis error in cacheAnalysis:', error);
    return {
      success: false,
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred',
      hits: isEmptyMention ? 1 : hits,
      cached: false,
      paymentRequired: !isEmptyMention && hits > 5,
      freeUsesLeft: isEmptyMention ? 5 : Math.max(0, 5 - hits)
    };
  }
}

// Export service object
export const analysisCacheService = {
  getCachedAnalysis,
  cacheAnalysis,
  cleanExpiredCache,
  generateCacheKey
} as const;
