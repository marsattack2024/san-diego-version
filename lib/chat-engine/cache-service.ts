/**
 * Chat Engine Cache Service
 * 
 * Provides a centralized cache interface for the chat engine components,
 * abstracting Redis operations and ensuring consistent caching patterns
 * across different implementations.
 */

import { redisCache } from '@/lib/cache/redis-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Cache key prefixes for different data types
export const CACHE_KEYS = {
    EMBEDDINGS: 'embedding:',
    DOCUMENT: 'doc:',
    SCRAPER: 'scrape:',
    PROMPT: 'prompt:',
    CONTEXT: 'context:',
    MESSAGE: 'msg:',
    SESSION: 'session:',
};

// TTL (Time-to-live) constants in seconds
export const CACHE_TTL = {
    EMBEDDINGS: 7 * 24 * 60 * 60, // 7 days
    DOCUMENT: 24 * 60 * 60,       // 1 day
    SCRAPER: 12 * 60 * 60,        // 12 hours
    PROMPT: 30 * 24 * 60 * 60,    // 30 days
    CONTEXT: 24 * 60 * 60,        // 1 day
    MESSAGE: 7 * 24 * 60 * 60,    // 7 days
    SESSION: 30 * 24 * 60 * 60,   // 30 days
    SHORT: 1 * 60 * 60,           // 1 hour
};

/**
 * Interface for cache options
 */
export interface CacheOptions {
    ttl?: number;
    namespace?: string;
}

/**
 * Chat engine cache service
 * Provides a unified interface for caching operations across different components
 */
export class ChatEngineCache {
    private namespace: string;

    /**
     * Create a new cache service instance
     * @param namespace Optional namespace to prefix all cache keys
     */
    constructor(namespace: string = 'chat-engine') {
        this.namespace = namespace;
    }

    /**
     * Generate a cache key with proper namespacing
     * @param key Base key
     * @param type Optional cache type prefix
     * @returns Namespaced cache key
     */
    private generateKey(key: string, type?: keyof typeof CACHE_KEYS): string {
        const prefix = type ? CACHE_KEYS[type] : '';
        return `${this.namespace}:${prefix}${key}`;
    }

    /**
     * Set a value in the cache
     * @param key Cache key
     * @param value Value to cache
     * @param options Cache options
     */
    async set(key: string, value: any, options?: CacheOptions): Promise<void> {
        try {
            const { ttl, namespace } = options || {};
            const nsKey = this.generateKey(key, namespace as keyof typeof CACHE_KEYS);

            await redisCache.set(nsKey, value, ttl);

            edgeLogger.debug('Cache set', {
                category: LOG_CATEGORIES.SYSTEM,
                key: nsKey,
                ttl,
                valueType: typeof value
            });
        } catch (error) {
            edgeLogger.error('Cache set error', {
                category: LOG_CATEGORIES.SYSTEM,
                key,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Get a value from the cache
     * @param key Cache key
     * @param namespace Optional namespace key type
     * @returns Cached value or null if not found
     */
    async get<T = any>(key: string, namespace?: keyof typeof CACHE_KEYS): Promise<T | null> {
        try {
            const nsKey = this.generateKey(key, namespace);
            const value = await redisCache.get(nsKey);

            edgeLogger.debug('Cache get', {
                category: LOG_CATEGORIES.SYSTEM,
                key: nsKey,
                hit: value !== null,
                valueType: typeof value
            });

            return value as T;
        } catch (error) {
            edgeLogger.error('Cache get error', {
                category: LOG_CATEGORIES.SYSTEM,
                key,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Check if a key exists in the cache
     * @param key Cache key
     * @param namespace Optional namespace key type
     * @returns True if key exists in cache
     */
    async exists(key: string, namespace?: keyof typeof CACHE_KEYS): Promise<boolean> {
        try {
            const nsKey = this.generateKey(key, namespace);
            const value = await redisCache.get(nsKey);
            return value !== null;
        } catch (error) {
            edgeLogger.error('Cache exists error', {
                category: LOG_CATEGORIES.SYSTEM,
                key,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Delete a value from the cache
     * @param key Cache key
     * @param namespace Optional namespace key type
     */
    async delete(key: string, namespace?: keyof typeof CACHE_KEYS): Promise<void> {
        try {
            const nsKey = this.generateKey(key, namespace);
            // Use set with expiry of 0 as a workaround if del is not available
            await redisCache.set(nsKey, null, 0);

            edgeLogger.debug('Cache delete', {
                category: LOG_CATEGORIES.SYSTEM,
                key: nsKey
            });
        } catch (error) {
            edgeLogger.error('Cache delete error', {
                category: LOG_CATEGORIES.SYSTEM,
                key,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Store document embeddings in the cache
     * @param query The query text used to generate the embedding
     * @param embedding The embedding vector to cache
     */
    async setEmbedding(query: string, embedding: number[]): Promise<void> {
        await this.set(query, embedding, {
            ttl: CACHE_TTL.EMBEDDINGS,
            namespace: 'EMBEDDINGS'
        });
    }

    /**
     * Retrieve cached embeddings
     * @param query The query to retrieve embeddings for
     * @returns The cached embedding vector or null
     */
    async getEmbedding(query: string): Promise<number[] | null> {
        return this.get<number[]>(query, 'EMBEDDINGS');
    }

    /**
     * Store scraped web content in the cache
     * @param url The URL that was scraped
     * @param content The scraped content
     */
    async setScrapedContent(url: string, content: string): Promise<void> {
        await this.set(url, content, {
            ttl: CACHE_TTL.SCRAPER,
            namespace: 'SCRAPER'
        });
    }

    /**
     * Retrieve cached scraped content
     * @param url The URL to retrieve content for
     * @returns The cached scraped content or null
     */
    async getScrapedContent(url: string): Promise<string | null> {
        return this.get<string>(url, 'SCRAPER');
    }

    /**
     * Store RAG context in the cache
     * @param sessionId Session identifier
     * @param query The query used to generate context
     * @param context The context to cache
     */
    async setContext(sessionId: string, query: string, context: any): Promise<void> {
        const key = `${sessionId}:${query}`;
        await this.set(key, context, {
            ttl: CACHE_TTL.CONTEXT,
            namespace: 'CONTEXT'
        });
    }

    /**
     * Retrieve cached RAG context
     * @param sessionId Session identifier
     * @param query The query to retrieve context for
     * @returns The cached context or null
     */
    async getContext(sessionId: string, query: string): Promise<any | null> {
        const key = `${sessionId}:${query}`;
        return this.get(key, 'CONTEXT');
    }

    /**
     * Store chat session data
     * @param sessionId Session identifier
     * @param data Session data to cache
     */
    async setSession(sessionId: string, data: any): Promise<void> {
        await this.set(sessionId, data, {
            ttl: CACHE_TTL.SESSION,
            namespace: 'SESSION'
        });
    }

    /**
     * Retrieve cached session data
     * @param sessionId Session identifier
     * @returns The cached session data or null
     */
    async getSession(sessionId: string): Promise<any | null> {
        return this.get(sessionId, 'SESSION');
    }
}

/**
 * Factory function to create a chat engine cache service
 * @param namespace Optional namespace for cache keys
 * @returns Configured ChatEngineCache instance
 */
export function createCacheService(namespace?: string): ChatEngineCache {
    return new ChatEngineCache(namespace);
}

// Export a default cache service instance
export const chatEngineCache = createCacheService(); 