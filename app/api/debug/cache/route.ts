import { cacheService } from '@/lib/cache/cache-service';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';

export const runtime = 'edge';

/**
 * Debug endpoint for inspecting Redis cache entries
 * 
 * This endpoint allows fetching and inspecting values from the Redis cache
 * using the standardized cacheService.
 * 
 * Example usage: /api/debug/cache?key=global:rag:4525a018453d5765
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key') || 'global:rag:4525a018453d5765';

  try {
    edgeLogger.info('Cache debug request', {
      category: LOG_CATEGORIES.SYSTEM,
      key
    });

    // Get raw value using cache service
    const rawValue = await cacheService.get(key);

    // Attempt to parse it if it's a string and looks like JSON
    let parsedValue = null;
    let parseError = null;

    try {
      if (typeof rawValue === 'string' &&
        (rawValue.startsWith('{') || rawValue.startsWith('['))) {
        parsedValue = JSON.parse(rawValue);
      }
    } catch (error) {
      parseError = {
        message: error instanceof Error ? error.message : String(error),
        type: typeof rawValue
      };
    }

    // Get stats about the key
    const exists = await cacheService.exists(key);

    return successResponse({
      key,
      exists,
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    edgeLogger.error('Cache debug error', {
      category: LOG_CATEGORIES.SYSTEM,
      key,
      error: error instanceof Error ? error.message : String(error)
    });

    return errorResponse(
      'Error accessing cache',
      error,
      500
    );
  }
} 