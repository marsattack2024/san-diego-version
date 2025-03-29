import { Redis } from '@upstash/redis';
import { edgeLogger } from '../logger/edge-logger';
import { OPERATION_TYPES } from '../logger/constants';
import type { RetrievedDocument } from './types.js';

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

// Initialize Redis client with Redis.fromEnv() for compatibility
async function initializeRedisClient() {
  try {
    // Log environment status
    edgeLogger.info('Initializing Redis client with Redis.fromEnv()', {
      category: 'system',
      envVarsPresent: {
        KV_REST_API_URL: !!process.env.KV_REST_API_URL,
        UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
        REDIS_URL: !!process.env.REDIS_URL
      }
    });

    // Use Redis.fromEnv() to be consistent with other parts of the app
    const redis = Redis.fromEnv();

    // Test connection before returning
    await redis.set('connection-test', 'ok', { ex: 60 });
    const testResult = await redis.get('connection-test');

    if (testResult !== 'ok') {
      throw new Error('Connection test failed');
    }

    edgeLogger.info('Upstash Redis connected using Redis.fromEnv()', {
      category: 'system'
    });

    await redis.del('connection-test');
    return redis;
  } catch (error) {
    edgeLogger.error('Failed to initialize Redis client', {
      category: 'system',
      error: error instanceof Error ? error.message : String(error)
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
        category: 'system',
        key,
        ttl: ttl || CACHE_CONFIG.ttl
      });
    } catch (error) {
      edgeLogger.error('Cache set error', {
        category: 'system',
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
      const hit = value !== null;

      // Log cache access at the appropriate level
      if (hit) {
        // Log cache hit at INFO level (10% sampling)
        edgeLogger.info('Cache hit', {
          category: 'system',
          operation: OPERATION_TYPES.CACHE_ACCESS,
          key,
          hit: true,
          valueType: typeof value,
          durationMs: 0 // We don't track this, but added for consistency
        });
      } else {
        // Log cache miss at WARN level (100% sampling)
        edgeLogger.warn('Cache miss', {
          category: 'system',
          operation: OPERATION_TYPES.CACHE_ACCESS,
          key,
          hit: false
        });
      }

      // Debug information is preserved at debug level
      edgeLogger.debug('Cache get details', {
        category: 'system',
        key,
        hit,
        valueType: typeof value,
        valueLength: typeof value === 'string' ? value.length : 'n/a'
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
            category: 'system',
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
        category: 'system',
        operation: OPERATION_TYPES.CACHE_ACCESS,
        error: error instanceof Error ? error.message : String(error),
        key,
        important: true
      });
      return null;
    }
  },

  // Specialized methods with tenant support
  async getRAG(tenantId: string, query: string): Promise<string | null> {
    const key = `${tenantId}:rag:${await hashKey(query)}`;
    const startTime = performance.now();
    const result = await this.get(key);
    const durationMs = Math.round(performance.now() - startTime);

    // Additional detailed RAG-specific logging with operation ID
    const ragOperationId = `rag-${Date.now().toString(36)}`;
    if (result !== null) {
      // For RAG, we want an additional specific log with the RAG_SEARCH operation
      edgeLogger.info('RAG cache hit', {
        category: 'system',
        operation: OPERATION_TYPES.RAG_SEARCH,
        ragOperationId,
        key,
        durationMs,
        cacheHit: true,
        fromCache: true
      });
    }

    return result;
  },

  async setRAG(tenantId: string, query: string, result: any): Promise<void> {
    const key = `${tenantId}:rag:${await hashKey(query)}`;
    await this.set(key, result);
  },

  async getScrape(tenantId: string, url: string): Promise<string | null> {
    const key = `${tenantId}:scrape:${await hashKey(url)}`;
    return this.get(key);
  },

  async setScrape(tenantId: string, url: string, content: string): Promise<void> {
    const key = `${tenantId}:scrape:${await hashKey(url)}`;
    await this.set(key, content);
  },

  async getDeepSearch(tenantId: string, query: string): Promise<string | null> {
    const key = `${tenantId}:deepsearch:${await hashKey(query)}`;
    return this.get(key);
  },

  async setDeepSearch(tenantId: string, query: string, result: string): Promise<void> {
    const key = `${tenantId}:deepsearch:${await hashKey(query)}`;
    await this.set(key, result, CACHE_CONFIG.shortTtl);
  }
}; 