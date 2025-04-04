import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, notFoundError } from '@/lib/utils/route-handler';
import { createFreshRedisClient } from '@/lib/utils/redis-client';

export const runtime = 'edge';

/**
 * A comprehensive cache debugging endpoint that shows the raw cached value,
 * attempts to parse it in different ways, and provides diagnostic information.
 * 
 * Query parameters:
 * - key: The Redis cache key to inspect
 * 
 * Example: /api/debug/cache-inspector?key=vector:query:12345
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return errorResponse(
        'Missing required parameter: key',
        { usage: '/api/debug/cache-inspector?key=your-cache-key' },
        400
      );
    }

    // Always create a fresh Redis client for debugging purposes
    // This ensures we're not affected by any singleton issues
    const redis = await createFreshRedisClient();

    // Perform a connection test first
    try {
      await redis.set('connection-test', 'ok', { ex: 60 });
      const testResult = await redis.get('connection-test');

      if (testResult !== 'ok') {
        throw new Error('Connection test failed');
      }

      // Log successful connection
      edgeLogger.info('Redis connection test successful for cache inspector', {
        category: LOG_CATEGORIES.SYSTEM
      });
    } catch (connError) {
      // Log connection error but continue trying to get the key
      edgeLogger.error('Redis connection test failed for cache inspector', {
        category: LOG_CATEGORIES.SYSTEM,
        error: connError instanceof Error ? connError.message : String(connError)
      });
    }

    const rawValue = await redis.get(key) as string;

    if (!rawValue) {
      return notFoundError(`Cache key not found: ${key}`);
    }

    // Prepare diagnostic information
    const diagnostics = {
      key,
      rawValue: {
        type: typeof rawValue,
        length: rawValue.length,
        preview: rawValue.substring(0, 100) + (rawValue.length > 100 ? '...' : ''),
        startsWithQuote: rawValue.startsWith('"'),
        endsWithQuote: rawValue.endsWith('"'),
        containsEscapedQuotes: rawValue.includes('\\"'),
        containsEscapeChars: rawValue.includes('\\'),
        containsObjectNotation: rawValue.includes('[object Object]'),
      },
      parsedValue: {
        directParse: null as any,
        directParseError: null as string | null,
        innerStringParse: null as any,
        innerStringParseError: null as string | null,
        innerStringAttempt: null as any,
        innerStringAttemptError: null as string | null
      }
    };

    // Attempt direct parsing
    try {
      const parsed = JSON.parse(rawValue);
      diagnostics.parsedValue.directParse = {
        type: typeof parsed,
        isArray: Array.isArray(parsed),
        preview: typeof parsed === 'object'
          ? JSON.stringify(parsed).substring(0, 100) + (JSON.stringify(parsed).length > 100 ? '...' : '')
          : String(parsed).substring(0, 100) + (String(parsed).length > 100 ? '...' : '')
      };
    } catch (error) {
      diagnostics.parsedValue.directParseError = error instanceof Error
        ? error.message
        : String(error);
    }

    // Check if this might be a doubly-stringified value
    if (typeof rawValue === 'string' && rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.includes('\\')) {
      try {
        // Extract the inner string by removing the outer quotes and unescaping
        const innerString = rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        diagnostics.parsedValue.innerStringAttempt = {
          innerStringPreview: innerString.substring(0, 100) + (innerString.length > 100 ? '...' : ''),
          innerStringLength: innerString.length
        };

        try {
          const parsedInner = JSON.parse(innerString);
          diagnostics.parsedValue.innerStringParse = {
            type: typeof parsedInner,
            isArray: Array.isArray(parsedInner),
            preview: typeof parsedInner === 'object'
              ? JSON.stringify(parsedInner).substring(0, 100) + (JSON.stringify(parsedInner).length > 100 ? '...' : '')
              : String(parsedInner).substring(0, 100) + (String(parsedInner).length > 100 ? '...' : '')
          };
        } catch (innerError) {
          diagnostics.parsedValue.innerStringParseError = innerError instanceof Error
            ? innerError.message
            : String(innerError);
        }
      } catch (error) {
        diagnostics.parsedValue.innerStringAttemptError = error instanceof Error
          ? error.message
          : String(error);
      }
    }

    // Log diagnostic activity
    edgeLogger.info('Cache inspection', {
      category: LOG_CATEGORIES.SYSTEM,
      key,
      valueType: typeof rawValue,
      valueLength: rawValue.length,
      directParseSuccess: diagnostics.parsedValue.directParse !== null,
      innerParseSuccess: diagnostics.parsedValue.innerStringParse !== null
    });

    return successResponse({
      success: true,
      diagnostics
    });
  } catch (error) {
    edgeLogger.error('Cache inspector error', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });

    return errorResponse(
      'Error inspecting cache',
      error instanceof Error ? error.message : String(error),
      500
    );
  }
} 