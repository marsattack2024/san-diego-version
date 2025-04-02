/**
 * Redis Connection Test Endpoint
 * 
 * This endpoint tests the Redis connection using our standardized client
 * and provides detailed diagnostics about the connection status.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { getRedisClient, createFreshRedisClient, resetRedisClient } from '@/lib/utils/redis-client';

export const runtime = 'edge';

export async function GET(request: Request): Promise<Response> {
    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') || 'singleton';
        const reset = searchParams.get('reset') === 'true';
        const testKey = `redis-test-${Date.now()}`;
        const testValue = `test-value-${Date.now()}`;

        // Log the test configuration
        edgeLogger.info('Redis connection test started', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: 'redis_test',
            mode,
            reset,
            testKey
        });

        // Reset the Redis client if requested
        if (reset) {
            resetRedisClient();
            edgeLogger.info('Redis client singleton reset', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'redis_test'
            });
        }

        // Get a Redis client based on the mode
        const redis = mode === 'fresh'
            ? await createFreshRedisClient()
            : await getRedisClient();

        // Start a test timer
        const startTime = Date.now();

        // Test 1: Basic write operation
        await redis.set(testKey, testValue, { ex: 60 });

        // Test 2: Basic read operation
        const readValue = await redis.get(testKey);

        // Test 3: Delete operation
        await redis.del(testKey);

        // Verify the deleted key is gone
        const afterDeleteValue = await redis.get(testKey);

        // Calculate total time
        const totalTime = Date.now() - startTime;

        // Collect environment information
        const envInfo = {
            KV_REST_API_URL: !!process.env.KV_REST_API_URL,
            KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
            UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
            UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
            REDIS_URL: !!process.env.REDIS_URL,
            REDIS_TOKEN: !!process.env.REDIS_TOKEN,
            REDIS_HOST: !!process.env.REDIS_HOST,
            REDIS_PORT: process.env.REDIS_PORT || '(not set)',
            REDIS_PASSWORD: !!process.env.REDIS_PASSWORD,
            VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
            VERCEL_REGION: process.env.VERCEL_REGION || '(not set)'
        };

        // Determine if we're using the in-memory fallback
        // This is a heuristic - the in-memory implementation doesn't have a type property
        const isInMemory = !('type' in redis) || redis.type === undefined;

        // Log success
        edgeLogger.info('Redis connection test completed successfully', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: 'redis_test',
            mode,
            totalTimeMs: totalTime,
            isInMemory,
            readValueCorrect: readValue === testValue,
            deletionSuccessful: afterDeleteValue === null
        });

        // Return the results
        return successResponse({
            success: true,
            mode,
            reset,
            metrics: {
                totalTimeMs: totalTime
            },
            tests: {
                writeSuccessful: true,
                readSuccessful: true,
                readValueCorrect: readValue === testValue,
                deletionSuccessful: afterDeleteValue === null
            },
            client: {
                implementation: isInMemory ? 'in-memory-fallback' : 'redis',
                mode
            },
            environment: envInfo
        });
    } catch (error) {
        // Log the error
        edgeLogger.error('Redis connection test failed', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: 'redis_test',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        // Return error response
        return errorResponse(
            'Redis connection test failed',
            {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            },
            500
        );
    }
} 