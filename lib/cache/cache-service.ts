/**
 * Redis Cache Service
 * 
 * This service provides a standardized interface for all Redis caching operations
 * in the application. It handles key generation, TTL management, and error handling
 * while providing both basic and domain-specific caching methods.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { CACHE_TTL, CACHE_NAMESPACES } from './constants';
import { getRedisClient } from '@/lib/utils/redis-client';

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
 * Cache Service implementation
 */
export class CacheService implements CacheServiceInterface {
  private redisPromise: Promise<any>;
  private namespace: string;
  private stats = { hits: 0, misses: 0, lastLoggedAt: Date.now() };

  constructor(namespace: string = CACHE_NAMESPACES.DEFAULT) {
    this.namespace = namespace;
    this.redisPromise = getRedisClient();
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

      edgeLogger.debug('Cache exists check', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        exists: result > 0
      });

      return result > 0;
    } catch (error) {
      edgeLogger.error('Cache exists error', {
        category: LOG_CATEGORIES.SYSTEM,
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  // -- RAG Cache Operations --

  /**
   * Get RAG results from cache
   * Uses a hash of the query and options as key
   */
  async getRagResults<T>(query: string, options?: any): Promise<T | null> {
    try {
      // Create stable key from query and options
      const queryKey = options
        ? `${query}:${this.stableStringify(options)}`
        : query;

      // Hash the key for storage efficiency and to handle complex queries
      const hashedKey = await this.hashKey(queryKey);

      return this.get<T>(`rag:${hashedKey}`);
    } catch (error) {
      edgeLogger.error('Get RAG results error', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Cache RAG results
   */
  async setRagResults<T>(query: string, results: T, options?: any): Promise<void> {
    try {
      // Create stable key from query and options
      const queryKey = options
        ? `${query}:${this.stableStringify(options)}`
        : query;

      // Hash the key for storage efficiency
      const hashedKey = await this.hashKey(queryKey);

      await this.set<T>(
        `rag:${hashedKey}`,
        results,
        { ttl: CACHE_TTL.RAG_RESULTS }
      );
    } catch (error) {
      edgeLogger.error('Set RAG results error', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // -- Web Scraping Cache Operations --

  /**
   * Get scraped content from cache
   * Uses a hash of the URL as key
   */
  async getScrapedContent(url: string): Promise<string | null> {
    try {
      // Hash the URL for storage efficiency
      const hashedKey = await this.hashKey(url);
      return this.get<string>(`scrape:${hashedKey}`);
    } catch (error) {
      edgeLogger.error('Get scraped content error', {
        category: LOG_CATEGORIES.SYSTEM,
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Cache scraped content
   */
  async setScrapedContent(url: string, content: string): Promise<void> {
    try {
      // Hash the URL for storage efficiency
      const hashedKey = await this.hashKey(url);
      await this.set(
        `scrape:${hashedKey}`,
        content,
        { ttl: CACHE_TTL.SCRAPER }
      );
    } catch (error) {
      edgeLogger.error('Set scraped content error', {
        category: LOG_CATEGORIES.SYSTEM,
        url,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // -- Deep Search Cache Operations --

  /**
   * Get deep search results from cache
   */
  async getDeepSearchResults<T>(query: string): Promise<T | null> {
    try {
      // Hash the query for storage efficiency
      const hashedKey = await this.hashKey(query);
      return this.get<T>(`deepsearch:${hashedKey}`);
    } catch (error) {
      edgeLogger.error('Get deep search results error', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Cache deep search results
   */
  async setDeepSearchResults<T>(query: string, results: T): Promise<void> {
    try {
      // Hash the query for storage efficiency
      const hashedKey = await this.hashKey(query);
      await this.set<T>(
        `deepsearch:${hashedKey}`,
        results,
        { ttl: CACHE_TTL.DEEP_SEARCH }
      );
    } catch (error) {
      edgeLogger.error('Set deep search results error', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Export a singleton instance for use across the application
export const cacheService = new CacheService(); 