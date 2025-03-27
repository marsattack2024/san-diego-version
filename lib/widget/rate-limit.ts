import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Type definitions
interface RateLimitOptions {
  limit?: number;  // Max requests per window
  window?: number; // Time window in seconds
}

interface MemoryStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

// Extend global for typesafety
declare global {
  var lastCleanup: number | undefined;
}

// Initialize store
let memoryStore: MemoryStore = {};

// Determine which store to use based on environment variables
const getRedisClient = (): Redis | null => {
  try {
    // Check for KV_REST_API_URL and KV_REST_API_TOKEN (Vercel KV)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      edgeLogger.info('Initializing Redis client with Vercel KV credentials');
      return Redis.fromEnv();
    }

    // Check for REDIS_URL (custom Redis setup)
    if (process.env.REDIS_URL) {
      edgeLogger.info('Initializing Redis client with REDIS_URL');
      return new Redis({
        url: process.env.REDIS_URL,
        token: process.env.REDIS_TOKEN || '' // Adding empty token to satisfy type requirements
      });
    }

    // Check for standard Redis connection params
    if (process.env.REDIS_HOST) {
      const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
      edgeLogger.info('Initializing Redis client with REDIS_HOST and REDIS_PORT');
      return new Redis({
        url: `redis://${process.env.REDIS_HOST}:${port}`,
        token: process.env.REDIS_PASSWORD || '',
      });
    }

    edgeLogger.warn('No Redis configuration found, will use in-memory store');
    return null;
  } catch (error) {
    edgeLogger.error('Error initializing Redis client', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};

// Create Redis client or use in-memory store
const redis = getRedisClient();

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

    // Track requests based on available store
    if (redis) {
      // Use Redis for distributed rate limiting
      try {
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
      }
    }

    // Memory store fallback (for local dev or Redis failure)
    const now = Date.now();

    // Clean up expired entries every minute
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

    // Calculate time until reset
    const msUntilReset = Math.max(0, memoryStore[key].resetAt - now);
    const secondsUntilReset = Math.ceil(msUntilReset / 1000);

    // Set headers for tracking
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', String(limit));
    headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - memoryStore[key].count)));
    headers.set('X-RateLimit-Reset', String(memoryStore[key].resetAt));

    // Check if rate limit exceeded
    if (memoryStore[key].count > limit) {
      headers.set('Retry-After', String(secondsUntilReset));

      edgeLogger.warn('Rate limit exceeded (memory store)', {
        sessionId,
        count: memoryStore[key].count,
        limit,
        resetInSeconds: secondsUntilReset,
        processingTime: Date.now() - startTime
      });

      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests',
          message: `Rate limit exceeded. Please wait ${secondsUntilReset} seconds before trying again.`,
          retryAfter: secondsUntilReset
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
      resetInSeconds: secondsUntilReset,
      processingTime: Date.now() - startTime
    });

    return null; // Continue to the next middleware
  } catch (error) {
    // Unexpected error - log but don't block the request
    edgeLogger.error('Unexpected error in rate limit middleware', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTime: Date.now() - startTime
    });

    return null; // Continue to the next middleware instead of blocking completely
  }
}

// Function to clean up expired entries in the memory store
function cleanMemoryStore() {
  const now = Date.now();
  let expiredCount = 0;

  Object.keys(memoryStore).forEach(key => {
    if (memoryStore[key].resetAt <= now) {
      delete memoryStore[key];
      expiredCount++;
    }
  });

  if (expiredCount > 0) {
    edgeLogger.info('Cleaned up expired rate limit entries', {
      expiredCount,
      remainingEntries: Object.keys(memoryStore).length
    });
  }
} 