import { Redis } from '@upstash/redis';
import { edgeLogger } from '../logger/edge-logger';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
});

// Cache configuration
const CACHE_CONFIG = {
  ttl: 12 * 60 * 60, // 12 hours in seconds
  similarityThreshold: 0.92 // Threshold for semantic similarity
};

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  semanticHits: 0
};

export const redisCache = {
  /**
   * Set a value in Redis cache
   */
  async set(key: string, value: any, ttlSeconds: number = CACHE_CONFIG.ttl): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (error) {
      edgeLogger.error('Redis cache set error', { 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  },
  
  /**
   * Get a value from Redis cache
   */
  async get(key: string): Promise<any> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value as string) : null;
    } catch (error) {
      edgeLogger.error('Redis cache get error', { 
        error: error instanceof Error ? error : new Error(String(error))
      });
      return null;
    }
  },
  
  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const keys = await redis.keys(pattern);
      return keys as string[];
    } catch (error) {
      edgeLogger.error('Redis cache keys error', { 
        error: error instanceof Error ? error : new Error(String(error))
      });
      return [];
    }
  },
  
  /**
   * Store cache statistics
   */
  recordStats(type: 'hit' | 'miss' | 'semantic_hit'): void {
    switch (type) {
      case 'hit':
        cacheStats.hits++;
        break;
      case 'miss':
        cacheStats.misses++;
        break;
      case 'semantic_hit':
        cacheStats.semanticHits++;
        break;
    }
    
    // Log stats periodically (every 100 operations)
    if ((cacheStats.hits + cacheStats.misses + cacheStats.semanticHits) % 100 === 0) {
      edgeLogger.info('Redis cache statistics', {
        operation: 'redis_cache_stats',
        ...cacheStats,
        hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses),
        semanticHitRate: cacheStats.semanticHits / (cacheStats.hits + cacheStats.misses)
      });
    }
  }
}; 