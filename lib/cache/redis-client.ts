import { Redis } from '@upstash/redis';
import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES } from '../logger/constants';

// Cache configuration
const CACHE_CONFIG = {
  ttl: 12 * 60 * 60,        // 12 hours default
  shortTtl: 1 * 60 * 60,    // 1 hour for LLM responses
  statsLogThreshold: 10,     // Log stats every 10 operations
  maxContentSize: 80000,     // Max content size in bytes
  retryAttempts: 3,         // Number of retry attempts
  retryDelay: 1000          // Delay between retries in ms
};

// Hash function using Web Crypto API
async function hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16);
}

// Initialize Redis client with proper error handling
async function initializeRedisClient() {
  // Check for required environment variables
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // Log environment status
  edgeLogger.info('Initializing Redis client', {
    category: LOG_CATEGORIES.SYSTEM,
    envVarsPresent: {
      REDIS_URL: !!url,
      REDIS_TOKEN: !!token
    }
  });

  // Validate environment variables
  if (!url || !token) {
    const missingVars = [];
    if (!url) missingVars.push('KV_REST_API_URL/UPSTASH_REDIS_REST_URL');
    if (!token) missingVars.push('KV_REST_API_TOKEN/UPSTASH_REDIS_REST_TOKEN');

    const error = `Missing required environment variables: ${missingVars.join(', ')}`;
    edgeLogger.error(error, {
      category: LOG_CATEGORIES.SYSTEM
    });
    throw new Error(error);
  }

  try {
    // Initialize with explicit configuration
    const redis = new Redis({
      url,
      token
    });

    // Test connection before returning
    await redis.set('connection-test', 'ok', { ex: 60 });
    const testResult = await redis.get('connection-test');

    if (testResult !== 'ok') {
      throw new Error('Connection test failed');
    }

    edgeLogger.info('Upstash Redis connected', {
      category: LOG_CATEGORIES.SYSTEM,
      url
    });

    await redis.del('connection-test');
    return redis;
  } catch (error) {
    edgeLogger.error('Failed to initialize Redis client', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error),
      url
    });
    throw error;
  }
}

// Initialize Redis client and export promise
export const redisClientPromise = initializeRedisClient();

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  semanticHits: 0,
  lastLoggedAt: Date.now()
};

// Helper to check if a string is valid JSON
function isValidJsonString(str: string): boolean {
  if (typeof str !== 'string') return false;
  try {
    const result = JSON.parse(str);
    return typeof result === 'object' && result !== null;
  } catch (e) {
    return false;
  }
}

// Redis client wrapper with JSON handling
export const redisCache = {
  /**
   * Set a value in Redis cache
   * The Upstash SDK will automatically stringify non-string values,
   * so we need to ensure we don't double-stringify
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const redis = await redisClientPromise;

      edgeLogger.debug('Cache set value type', {
        type: typeof value,
        isNull: value === null,
        isUndefined: value === undefined,
        isString: typeof value === 'string'
      });

      // Let the Upstash Redis SDK handle serialization based on its own rules
      // This is the recommended approach from Upstash documentation
      if (ttl) {
        await redis.set(key, value, { ex: ttl });
      } else {
        await redis.set(key, value, { ex: CACHE_CONFIG.ttl });
      }

      edgeLogger.debug('Cache set', {
        category: LOG_CATEGORIES.SYSTEM,
        key,
        ttl: ttl || CACHE_CONFIG.ttl
      });
    } catch (error) {
      edgeLogger.error('Cache set error', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error),
        key
      });
    }
  },

  /**
   * Get a value from Redis cache
   * The Upstash SDK doesn't automatically parse JSON strings,
   * so we need to handle that ourselves
   */
  async get(key: string): Promise<any> {
    try {
      const redis = await redisClientPromise;
      const value = await redis.get(key);

      // Update stats
      if (value !== null && value !== undefined) {
        cacheStats.hits++;
      } else {
        cacheStats.misses++;
      }

      // Log periodically
      const totalOps = cacheStats.hits + cacheStats.misses;
      const timeSinceLastLog = Date.now() - cacheStats.lastLoggedAt;
      if (totalOps % CACHE_CONFIG.statsLogThreshold === 0 || timeSinceLastLog > 60000) {
        edgeLogger.info('Cache stats', {
          category: LOG_CATEGORIES.SYSTEM,
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          hitRate: totalOps > 0 ? cacheStats.hits / totalOps : 0,
          timeSinceLastLogMs: timeSinceLastLog
        });
        cacheStats.lastLoggedAt = Date.now();
      }

      edgeLogger.debug('Cache get', {
        category: LOG_CATEGORIES.SYSTEM,
        key,
        hit: value !== null,
        valueType: typeof value
      });

      if (value === null || value === undefined) {
        return null;
      }

      // Handle string values that might be JSON
      if (typeof value === 'string') {
        try {
          // Attempt to parse as JSON if it's a valid JSON string
          if (isValidJsonString(value)) {
            return JSON.parse(value);
          }
          // If it's not valid JSON, return the string as is
          return value;
        } catch (parseError) {
          edgeLogger.warn('Cache parse error', {
            category: LOG_CATEGORIES.SYSTEM,
            key,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
          return value; // Return the raw string if parsing fails
        }
      }

      // Return non-string values as is
      return value;
    } catch (error) {
      edgeLogger.error('Cache get error', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error),
        key
      });
      return null;
    }
  },

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const redis = await redisClientPromise;
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
   * Record cache statistics
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

    const totalOps = cacheStats.hits + cacheStats.misses + cacheStats.semanticHits;
    const timeSinceLastLog = Date.now() - cacheStats.lastLoggedAt;

    // Log stats more frequently during debugging
    if (totalOps % CACHE_CONFIG.statsLogThreshold === 0 || timeSinceLastLog > 60000) {
      edgeLogger.info('Redis cache statistics', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'redis_cache_stats',
        ...cacheStats,
        totalOperations: totalOps,
        hitRate: totalOps > 0 ? cacheStats.hits / totalOps : 0,
        semanticHitRate: totalOps > 0 ? cacheStats.semanticHits / totalOps : 0,
        timeSinceLastLogMs: timeSinceLastLog
      });
      cacheStats.lastLoggedAt = Date.now();
    }
  },

  // Specialized methods with tenant support
  async getRAG(tenantId: string, query: string): Promise<any> {
    const key = `${tenantId}:rag:${await hashKey(query)}`;
    return this.get(key);
  },

  async setRAG(tenantId: string, query: string, result: any): Promise<void> {
    const key = `${tenantId}:rag:${await hashKey(query)}`;
    await this.set(key, result);
  },

  async getScrape(tenantId: string, url: string): Promise<any> {
    const key = `${tenantId}:scrape:${await hashKey(url)}`;
    return this.get(key);
  },

  async setScrape(tenantId: string, url: string, content: any): Promise<void> {
    const key = `${tenantId}:scrape:${await hashKey(url)}`;
    await this.set(key, content);
  },

  async getDeepSearch(tenantId: string, query: string): Promise<any> {
    const key = `${tenantId}:deepsearch:${await hashKey(query)}`;
    return this.get(key);
  },

  async setDeepSearch(tenantId: string, query: string, result: any): Promise<void> {
    const key = `${tenantId}:deepsearch:${await hashKey(query)}`;
    await this.set(key, result, CACHE_CONFIG.shortTtl);
  },

  async getLLM(tenantId: string, prompt: string): Promise<any> {
    const key = `${tenantId}:llm:${await hashKey(prompt)}`;
    return this.get(key);
  },

  async setLLM(tenantId: string, prompt: string, response: any): Promise<void> {
    const key = `${tenantId}:llm:${await hashKey(prompt)}`;
    await this.set(key, response, CACHE_CONFIG.shortTtl);
  }
}; 