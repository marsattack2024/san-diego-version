/**
 * Widget Rate Limiting Middleware
 * 
 * This middleware handles rate limiting for widget chat requests.
 * It supports both Redis and in-memory stores for rate limiting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { getRedisClient } from '@/lib/utils/redis-client';

// Interface for rate limiting options
export interface RateLimitOptions {
  limit?: number;
  window?: number;
}

// Global memory store for fallbacks
interface MemoryStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

// Add lastCleanup to global scope for in-memory store management
declare global {
  var memoryStore: MemoryStore;
  var lastCleanup: number | undefined;
}

// Initialize store
let memoryStore: MemoryStore = {};

// Rate limit middleware
export async function rateLimitMiddleware(
  req: NextRequest,
  options: RateLimitOptions = {}
): Promise<Response | null> {
  const startTime = Date.now();

  // Extract configuration options with increased defaults
  const limit = options.limit || 10; // Increased from 3 to 10 requests per minute
  const window = options.window || 60; // Default window of 60 seconds (1 minute)

  try {
    // Extract session ID from request - either from body or headers
    let sessionId: string | null = null;
    let body: any = {};

    try {
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const clonedReq = req.clone();
        const text = await clonedReq.text();

        if (text) {
          body = JSON.parse(text);
          sessionId = body.sessionId || null;
        }
      }
    } catch (error) {
      edgeLogger.warn('Error parsing request body for session ID', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // If not found in body, check headers
    if (!sessionId) {
      sessionId = req.headers.get('x-session-id');
    }

    // If still no session ID, use IP as fallback
    if (!sessionId) {
      const forwardedFor = req.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
      sessionId = `ip-${ip}`;
    }

    // Sanitize session ID for use as a key
    const key = `rate-limit:${sessionId}`;

    // Log the start of rate limit check
    edgeLogger.info('Checking rate limit', {
      sessionId,
      key,
      limit,
      window
    });

    try {
      // Use Redis for distributed rate limiting
      const redis = await getRedisClient();

      // Use Lua script for atomic increment and expiry
      const result = await redis.eval(`
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local count = redis.call('INCR', key)
        
        if count == 1 then
          redis.call('EXPIRE', key, window)
        end
        
        return count
      `, [key], [limit, window]) as number;

      // Get the TTL to know when the limit resets
      const ttl = await redis.ttl(key);
      const resetAt = Date.now() + (ttl * 1000);

      // Set headers for internal tracking
      const headers = new Headers();
      headers.set('X-RateLimit-Limit', String(limit));
      headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - result)));
      headers.set('X-RateLimit-Reset', String(resetAt));

      // Check if rate limit exceeded
      if (result > limit) {
        const retryAfter = Math.ceil(ttl);
        headers.set('Retry-After', String(retryAfter));

        edgeLogger.warn('Rate limit exceeded', {
          sessionId,
          count: result,
          limit,
          resetInSeconds: retryAfter,
          processingTime: Date.now() - startTime
        });

        return new NextResponse(
          JSON.stringify({
            error: 'Too many requests',
            message: `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
            retryAfter
          }),
          {
            status: 429,
            headers
          }
        );
      }

      edgeLogger.info('Rate limit check passed', {
        sessionId,
        count: result,
        remaining: Math.max(0, limit - result),
        resetInSeconds: ttl,
        processingTime: Date.now() - startTime
      });

      return null; // Continue to the next middleware
    } catch (error) {
      // Redis error - log but don't block the request
      edgeLogger.error('Redis rate limit error', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      });

      // Fall back to memory store if Redis fails
      edgeLogger.info('Falling back to memory store for rate limiting', { sessionId });

      // Use in-memory rate limiting as fallback
      return useMemoryRateLimiting(sessionId, key, limit, window, startTime);
    }
  } catch (error) {
    edgeLogger.error('Unexpected rate limiting error', {
      error: error instanceof Error ? error.message : String(error)
    });

    // On error, let the request through - better to allow than block incorrectly
    return null;
  }
}

/**
 * Fallback memory-based rate limiting when Redis is unavailable
 */
function useMemoryRateLimiting(
  sessionId: string,
  key: string,
  limit: number,
  window: number,
  startTime: number
): Response | null {
  // Clean up expired entries every minute
  const now = Date.now();
  const cleanupDue = (!global.lastCleanup || now - global.lastCleanup > 60000);

  if (cleanupDue) {
    cleanMemoryStore();
    global.lastCleanup = now;
  }

  // Check if entry exists
  if (!memoryStore[key]) {
    memoryStore[key] = {
      count: 0,
      resetAt: now + (window * 1000)
    };
  }

  // Reset counter if window has passed
  if (memoryStore[key].resetAt <= now) {
    memoryStore[key] = {
      count: 0,
      resetAt: now + (window * 1000)
    };
  }

  // Increment counter
  memoryStore[key].count++;

  // Set headers for internal tracking
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(limit));
  headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - memoryStore[key].count)));
  headers.set('X-RateLimit-Reset', String(memoryStore[key].resetAt));

  // Check if rate limit exceeded
  if (memoryStore[key].count > limit) {
    const ttl = Math.ceil((memoryStore[key].resetAt - now) / 1000);
    headers.set('Retry-After', String(ttl));

    edgeLogger.warn('Rate limit exceeded (memory store)', {
      sessionId,
      count: memoryStore[key].count,
      limit,
      resetInSeconds: ttl,
      processingTime: Date.now() - startTime
    });

    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please wait ${ttl} seconds before trying again.`,
        retryAfter: ttl
      }),
      {
        status: 429,
        headers
      }
    );
  }

  edgeLogger.info('Rate limit check passed (memory store)', {
    sessionId,
    count: memoryStore[key].count,
    remaining: Math.max(0, limit - memoryStore[key].count),
    resetInSeconds: Math.ceil((memoryStore[key].resetAt - now) / 1000),
    processingTime: Date.now() - startTime
  });

  return null; // Continue to the next middleware
}

/**
 * Clean up expired entries from the memory store
 */
function cleanMemoryStore() {
  const now = Date.now();
  let cleanupCount = 0;

  Object.keys(memoryStore).forEach(key => {
    if (memoryStore[key].resetAt <= now) {
      delete memoryStore[key];
      cleanupCount++;
    }
  });

  if (cleanupCount > 0) {
    edgeLogger.debug(`Cleaned up ${cleanupCount} expired rate limit entries`, {
      category: LOG_CATEGORIES.SYSTEM,
      cleanupCount,
      remainingEntries: Object.keys(memoryStore).length
    });
  }
} 