/**
 * Redis Cache Service
 * 
 * This service provides a standardized interface for all Redis caching operations
 * in the application. It handles key generation, TTL management, and error handling
 * while providing both basic and domain-specific caching methods.
 */

import { Redis } from '@upstash/redis';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { CACHE_TTL, CACHE_NAMESPACES, NAMESPACES } from './constants';

/**
 * Interface for the Cache Service
 */
export interface CacheServiceInterface {
  // Basic operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  
  // Domain-specific operations
  getRagResults<T>(query: string, options?: any): Promise<T | null>;
  setRagResults<T>(query: string, results: T, options?: any): Promise<void>;
  
  getScrapedContent(url: string): Promise<string | null>;
  setScrapedContent(url: string, content: string): Promise<void>;
  
  getDeepSearchResults<T>(query: string): Promise<T | null>;
  setDeepSearchResults<T>(query: string, results: T): Promise<void>;
}

/**
 * Create a Redis client with error handling and fallback
 */
async function createRedisClient(): Promise<Redis | any> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  // Log initialization
  edgeLogger.info('Initializing Redis client', {
    category: LOG_CATEGORIES.SYSTEM,
    operation: 'redis_init',
    envVarsPresent: {
      REDIS_URL: !!url,
      REDIS_TOKEN: !!token
    }
  });
  
  // Return in-memory fallback if env vars are missing
  if (!url || !token) {
    edgeLogger.warn('Missing Redis environment variables, using fallback', {
      category: LOG_CATEGORIES.SYSTEM
    });
    return createInMemoryFallback();
  }
  
  try {
    // Initialize with Upstash
    const redis = new Redis({
      url,
      token
    });
    
    // Test connection
    await redis.set('connection-test', 'ok', { ex: 60 });
    const testResult = await redis.get('connection-test');
    
    if (testResult !== 'ok') {
      throw new Error('Connection test failed');
    }
    
    edgeLogger.info('Redis connected successfully', {
      category: LOG_CATEGORIES.SYSTEM
    });
    
    await redis.del('connection-test');
    return redis;
  } catch (error) {
    edgeLogger.error('Redis connection failed, using fallback', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });
    return createInMemoryFallback();
  }
}

/**
 * Create an in-memory fallback for Redis
 * Used when Redis connection fails or environment variables are missing
 */
function createInMemoryFallback() {
  const store = new Map<string, { value: any, expiry: number | null }>();
  
  edgeLogger.info('Creating in-memory cache fallback', {
    category: LOG_CATEGORIES.SYSTEM
  });
  
  return {
    async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
      const expiry = options?.ex ? Date.now() + (options.ex * 1000) : null;
      store.set(key, { value, expiry });
      return 'OK';
    },
    
    async get(key: string): Promise<any> {
      const item = store.get(key);
      if (!item) return null;
      
      if (item.expiry && item.expiry < Date.now()) {
        store.delete(key);
        return null;
      }
      
      return item.value;
    },
    
    async del(key: string): Promise<number> {
      const deleted = store.delete(key);
      return deleted ? 1 : 0;
    },
    
    async exists(key: string): Promise<number> {
      const item = store.get(key);
      if (!item) return 0;
      
      if (item.expiry && item.expiry < Date.now()) {
        store.delete(key);
        return 0;
      }
      
      return 1;
    }
  };
}

/**
 * Cache Service implementation
 */
export class CacheService implements CacheServiceInterface {
  private redisPromise: Promise<Redis | any>;
  private namespace: string;
  private stats = { hits: 0, misses: 0, lastLoggedAt: Date.now() };
  
  constructor(namespace: string = CACHE_NAMESPACES.DEFAULT) {
    this.namespace = namespace;
    this.redisPromise = createRedisClient();
  }
  
  /**
   * Generate a consistent key with namespace
   */
  private generateKey(key: string, prefix?: string): string {
    return prefix 
      ? `${this.namespace}:${prefix}:${key}`
      : `${this.namespace}:${key}`;
  }
  
  /**
   * Generate a SHA-1 hash of the input using Web Crypto API (Edge compatible)
   */
  private async hashKey(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Truncate to 16 characters (64 bits)
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
  
  /**
   * Ensure consistent serialization of complex objects
   */
  private stableStringify(obj: Record<string, any>): string {
    if (typeof obj !== 'object' || obj === null) {
      return JSON.stringify(obj);
    }
    
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    
    for (const key of sortedKeys) {
      result[key] = obj[key];
    }
    
    return JSON.stringify(result);
  }
  
  /**
   * Get a value from the cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.generateKey(key);
    try {
      const redis = await this.redisPromise;
      const value = await redis.get(fullKey);
      
      // Update stats
      if (value !== null) {
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
      
      // Log stats periodically
      const totalOps = this.stats.hits + this.stats.misses;
      if (totalOps % 20 === 0 || Date.now() - this.stats.lastLoggedAt > 60000) {
        edgeLogger.info('Cache stats', {
          category: LOG_CATEGORIES.SYSTEM,
          hits: this.stats.hits,
          misses: this.stats.misses,
          hitRate: totalOps > 0 ? this.stats.hits / totalOps : 0
        });
        this.stats.lastLoggedAt = Date.now();
      }
      
      edgeLogger.debug('Cache get', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        hit: value !== null
      });
      
      return value as T;
    } catch (error) {
      edgeLogger.error('Cache get error', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Set a value in the cache
   */
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const fullKey = this.generateKey(key);
    try {
      const redis = await this.redisPromise;
      
      if (options?.ttl) {
        await redis.set(fullKey, value, { ex: options.ttl });
      } else {
        await redis.set(fullKey, value);
      }
      
      edgeLogger.debug('Cache set', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        ttl: options?.ttl
      });
    } catch (error) {
      edgeLogger.error('Cache set error', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.generateKey(key);
    try {
      const redis = await this.redisPromise;
      await redis.del(fullKey);
      
      edgeLogger.debug('Cache delete', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey
      });
    } catch (error) {
      edgeLogger.error('Cache delete error', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Check if a key exists in the cache
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.generateKey(key);
    try {
      const redis = await this.redisPromise;
      const result = await redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      edgeLogger.error('Cache exists error', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Get RAG results from cache
   * @param query Search query
   * @param options Additional options like tenantId, filters, etc.
   */
  async getRagResults<T>(query: string, options?: any): Promise<T | null> {
    // Normalize inputs
    const normalizedQuery = query.toLowerCase().trim();
    
    // Create a stable representation of the query and options
    const keyContent = {
      q: normalizedQuery,
      opts: options || {}
    };
    
    // Generate a hash for the cache key
    const hashInput = this.stableStringify(keyContent);
    const hashedKey = await this.hashKey(hashInput);
    
    return this.get<T>(this.generateKey(hashedKey, CACHE_NAMESPACES.RAG));
  }
  
  /**
   * Set RAG results in cache
   * @param query Search query
   * @param results Results to cache
   * @param options Additional options like tenantId, filters, etc.
   */
  async setRagResults<T>(query: string, results: T, options?: any): Promise<void> {
    // Normalize inputs
    const normalizedQuery = query.toLowerCase().trim();
    
    // Create a stable representation of the query and options
    const keyContent = {
      q: normalizedQuery,
      opts: options || {}
    };
    
    // Generate a hash for the cache key
    const hashInput = this.stableStringify(keyContent);
    const hashedKey = await this.hashKey(hashInput);
    
    return this.set<T>(
      this.generateKey(hashedKey, CACHE_NAMESPACES.RAG),
      results,
      { ttl: CACHE_TTL.RAG_RESULTS }
    );
  }
  
  /**
   * Get scraped content from cache
   * @param url URL of the scraped content
   */
  async getScrapedContent(url: string): Promise<string | null> {
    // Normalize URL
    const normalizedUrl = url.toLowerCase().trim();
    const hashedUrl = await this.hashKey(normalizedUrl);
    
    return this.get<string>(this.generateKey(hashedUrl, CACHE_NAMESPACES.SCRAPER));
  }
  
  /**
   * Set scraped content in cache
   * @param url URL of the scraped content
   * @param content Content to cache
   */
  async setScrapedContent(url: string, content: string): Promise<void> {
    // Normalize URL
    const normalizedUrl = url.toLowerCase().trim();
    const hashedUrl = await this.hashKey(normalizedUrl);
    
    return this.set<string>(
      this.generateKey(hashedUrl, CACHE_NAMESPACES.SCRAPER),
      content,
      { ttl: CACHE_TTL.SCRAPER }
    );
  }
  
  /**
   * Retrieves deep search results from cache
   * 
   * @param query - The search query
   * @returns Cached results or null if not found
   */
  async getDeepSearchResults<T>(query: string): Promise<T | null> {
    try {
      // Normalize query
      const normalizedQuery = query.toLowerCase().trim();
      const hashedQuery = await this.hashKey(normalizedQuery);
      const key = this.generateKey(hashedQuery, CACHE_NAMESPACES.DEEP_SEARCH);
      const cachedData = await this.get<T>(key);
      
      if (cachedData) {
        edgeLogger.info('Cache hit for deep search query', { 
          category: LOG_CATEGORIES.CACHE, 
          service: 'cache-service', 
          query,
          key
        });
        return cachedData;
      }
      
      edgeLogger.info('Cache miss for deep search query', { 
        category: LOG_CATEGORIES.CACHE, 
        service: 'cache-service',
        query,
        key
      });
      return null;
    } catch (error) {
      edgeLogger.error('Error retrieving deep search results from cache', {
        category: LOG_CATEGORIES.CACHE,
        service: 'cache-service',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Stores deep search results in cache
   * 
   * @param query - The search query
   * @param results - The results to cache
   * @returns Promise that resolves when complete
   */
  async setDeepSearchResults<T>(query: string, results: T): Promise<void> {
    try {
      // Normalize query
      const normalizedQuery = query.toLowerCase().trim();
      const hashedQuery = await this.hashKey(normalizedQuery);
      const key = this.generateKey(hashedQuery, CACHE_NAMESPACES.DEEP_SEARCH);
      
      await this.set(key, results, { ttl: CACHE_TTL.DEEP_SEARCH });
      
      edgeLogger.info('Cached deep search results', {
        category: LOG_CATEGORIES.CACHE,
        service: 'cache-service',
        query,
        key
      });
    } catch (error) {
      edgeLogger.error('Error caching deep search results', {
        category: LOG_CATEGORIES.CACHE,
        service: 'cache-service',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Export a singleton instance for use across the application
export const cacheService = new CacheService(); 