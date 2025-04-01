import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Redis } from '@upstash/redis';
import { successResponse, errorResponse, notFoundError } from '@/lib/utils/route-handler';

export const runtime = 'edge';

// Initialize Redis client directly using environment variables
const redis = Redis.fromEnv();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key') || 'global:rag:4525a018453d5765';

    edgeLogger.info('Cache repair attempt', {
      category: LOG_CATEGORIES.SYSTEM,
      key
    });

    // Step 1: Get the raw value directly from Redis
    const rawValue = await redis.get(key);

    if (!rawValue) {
      return notFoundError(`Cache key not found: ${key}`);
    }

    // Step 2: Attempt to fix double-stringified values
    let fixedValue;
    const isDoubleStringified =
      typeof rawValue === 'string' &&
      rawValue.startsWith('"') &&
      rawValue.endsWith('"') &&
      rawValue.includes('\\');

    if (isDoubleStringified) {
      try {
        // Parse the outer JSON string
        const innerJson = JSON.parse(rawValue);

        // The inner value should now be a string, so we use it directly
        fixedValue = innerJson;

        edgeLogger.info('Fixed double-stringified JSON', {
          category: LOG_CATEGORIES.SYSTEM,
          key,
          originalLength: rawValue.length,
          fixedLength: typeof fixedValue === 'string' ? fixedValue.length : 'not a string'
        });
      } catch (e) {
        edgeLogger.error('Failed to fix double-stringified JSON', {
          category: LOG_CATEGORIES.SYSTEM,
          key,
          error: e instanceof Error ? e.message : String(e)
        });

        return errorResponse(
          'Failed to fix double-stringified JSON',
          {
            rawValue,
            parseError: e instanceof Error ? e.message : String(e)
          },
          400
        );
      }
    } else {
      // Not double-stringified, so we use it as is
      fixedValue = rawValue;

      edgeLogger.info('Value not double-stringified, no fix needed', {
        category: LOG_CATEGORIES.SYSTEM,
        key
      });
    }

    // Step 3: Store the fixed value back in Redis
    // We use the direct Redis client to avoid any additional processing
    await redis.set(key, fixedValue);

    // Step 4: Verify the fix
    const newValue = await redis.get(key);

    return successResponse({
      key,
      fixed: isDoubleStringified,
      originalValue: rawValue,
      fixedValue,
      newValue,
      success: newValue === fixedValue
    });
  } catch (error) {
    edgeLogger.error('Cache repair error', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return errorResponse(
      'Error repairing cache',
      error instanceof Error ? error.message : String(error),
      500
    );
  }
} 