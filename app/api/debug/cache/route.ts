import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { cacheService } from '@/lib/cache/cache-service';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Initialize Redis client directly using environment variables
const redis = Redis.fromEnv();

/**
 * Debug endpoint for inspecting Redis cache entries
 * 
 * This endpoint allows fetching and inspecting values from the Redis cache
 * using both the raw Redis client and the cacheService for comparison.
 * 
 * Example usage: /api/debug/cache?key=global:rag:4525a018453d5765
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key') || 'global:rag:4525a018453d5765';

  try {
    edgeLogger.info('Cache debug request', {
      category: LOG_CATEGORIES.SYSTEM,
      key
    });

    // Get raw value directly from Redis without any processing
    const rawValue = await redis.get(key);

    // Attempt to parse it if it's a string
    let parsedValue = null;
    let parseError = null;

    try {
      if (typeof rawValue === 'string') {
        parsedValue = JSON.parse(rawValue);
      }
    } catch (error) {
      parseError = {
        message: error instanceof Error ? error.message : String(error),
        type: typeof rawValue
      };
    }

    // Get value using our cache service for comparison
    const cacheResult = await cacheService.get(key);

    return NextResponse.json({
      key,
      exists: rawValue !== null,
      rawValue,
      rawValueType: typeof rawValue,
      rawValueLength: typeof rawValue === 'string' ? rawValue.length : null,
      // If rawValue starts with a quote and ends with a quote, it might be double-stringified
      possiblyDoubleStringified: typeof rawValue === 'string' &&
        rawValue.startsWith('"') &&
        rawValue.endsWith('"') &&
        rawValue.includes('\\'),
      parseError,
      parsedValue,
      cacheResult,
      cacheResultType: typeof cacheResult,
      timestamp: new Date().toISOString()
    }, {
      status: 200
    });
  } catch (error) {
    edgeLogger.error('Cache debug error', {
      category: LOG_CATEGORIES.SYSTEM,
      key,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 500
    });
  }
} 