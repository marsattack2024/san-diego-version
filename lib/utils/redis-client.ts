/**
 * Standardized Redis Client Utility
 * 
 * This module provides a consistent way to initialize Redis clients across the application.
 * It handles different environment setups (Vercel KV, direct Redis, etc.) and provides
 * a fallback mechanism when Redis is unavailable.
 */

import { Redis } from '@upstash/redis';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Store singleton instance
let redisClientPromise: Promise<Redis | any> | null = null;

/**
 * Create an in-memory fallback for Redis
 * Used when Redis connection fails or environment variables are missing
 */
function createInMemoryFallback() {
    const store = new Map<string, { value: any, expiry: number | null }>();

    edgeLogger.info('Creating in-memory cache fallback', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'redis_fallback_init'
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
        },

        async eval(): Promise<any> {
            // Simple stub for eval
            return 0;
        },

        async ttl(): Promise<number> {
            // Simple stub for ttl
            return 0;
        }
    };
}

/**
 * Create a Redis client with standardized initialization
 * This function attempts to connect to Redis using environment variables
 * in the following priority order:
 * 
 * 1. Vercel KV REST API (KV_REST_API_URL + KV_REST_API_TOKEN)
 * 2. Upstash Redis REST API (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 * 3. Redis URL String (REDIS_URL)
 * 4. Standard Redis Connection Params (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD)
 * 
 * If none are available or if connection fails, fallback to in-memory implementation
 */
export async function createRedisClient(): Promise<Redis | any> {
    // Check for connection details
    const kvRestUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvRestToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;

    // Log initialization attempt
    edgeLogger.info('Initializing Redis client', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'redis_init',
        envVarsPresent: {
            KV_REST_API_URL: !!kvRestUrl,
            KV_REST_API_TOKEN: !!kvRestToken,
            REDIS_URL: !!redisUrl,
            REDIS_HOST: !!redisHost
        }
    });

    try {
        // Try Vercel KV / Upstash REST API first (preferred method)
        if (kvRestUrl && kvRestToken) {
            edgeLogger.info('Using Vercel KV / Upstash REST API for Redis', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_init'
            });

            // Use Redis.fromEnv() if both KV REST variables are present
            // This works with both Vercel KV and direct Upstash configuration
            const redis = new Redis({
                url: kvRestUrl,
                token: kvRestToken
            });

            // Test connection
            await redis.set('connection-test', 'ok', { ex: 60 });
            const testResult = await redis.get('connection-test');

            if (testResult !== 'ok') {
                throw new Error('Connection test failed for REST API client');
            }

            await redis.del('connection-test');

            edgeLogger.info('Redis REST API connection successful', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_init_success'
            });

            return redis;
        }

        // Try direct Redis URL if REST API not available
        if (redisUrl) {
            edgeLogger.info('Using REDIS_URL for connection', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_init'
            });

            const redis = new Redis({
                url: redisUrl,
                token: process.env.REDIS_TOKEN || '' // Token might not be needed for direct URL
            });

            // Test connection
            await redis.set('connection-test', 'ok', { ex: 60 });
            const testResult = await redis.get('connection-test');

            if (testResult !== 'ok') {
                throw new Error('Connection test failed for REDIS_URL client');
            }

            await redis.del('connection-test');

            edgeLogger.info('Redis URL connection successful', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_init_success'
            });

            return redis;
        }

        // Try standard connection parameters
        if (redisHost) {
            const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

            edgeLogger.info('Using REDIS_HOST and REDIS_PORT for connection', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_init',
                host: redisHost,
                port
            });

            const redis = new Redis({
                url: `redis://${redisHost}:${port}`,
                token: process.env.REDIS_PASSWORD || ''
            });

            // Test connection
            await redis.set('connection-test', 'ok', { ex: 60 });
            const testResult = await redis.get('connection-test');

            if (testResult !== 'ok') {
                throw new Error('Connection test failed for host/port client');
            }

            await redis.del('connection-test');

            edgeLogger.info('Redis host/port connection successful', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_init_success'
            });

            return redis;
        }

        // No valid configuration found
        edgeLogger.warn('No Redis configuration found, using in-memory fallback', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: 'redis_init_fallback'
        });

        return createInMemoryFallback();
    } catch (error) {
        // Log connection error
        edgeLogger.error('Redis connection failed, using in-memory fallback', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: 'redis_init_error',
            error: error instanceof Error ? error.message : String(error)
        });

        return createInMemoryFallback();
    }
}

/**
 * Get a Redis client singleton instance
 * This ensures we're reusing the same client across the application
 */
export async function getRedisClient(): Promise<Redis | any> {
    if (!redisClientPromise) {
        redisClientPromise = createRedisClient();
    }

    return redisClientPromise;
}

/**
 * Reset the Redis client singleton (mostly for testing)
 */
export function resetRedisClient(): void {
    redisClientPromise = null;
}

/**
 * Create a fresh Redis client without using the singleton
 * This is useful for specialized use cases like debugging
 */
export async function createFreshRedisClient(): Promise<Redis | any> {
    return createRedisClient();
} 