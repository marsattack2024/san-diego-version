import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Create Redis client if environment variables are set
let redis: Redis | null = null;

try {
  // Check for URL - try all possible environment variable names
  const url = process.env.KV_REST_API_URL || process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL;
  // Check for token
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (url && token) {
    redis = new Redis({
      url,
      token,
    });
    edgeLogger.info('Redis rate limiter initialized successfully', { url });
  } else {
    edgeLogger.warn('Redis credentials not found, rate limiting will be memory-based only');
  }
} catch (error) {
  edgeLogger.error('Failed to initialize Redis client', { error: String(error) });
}

// In-memory rate limit store (fallback when Redis is not available)
// This is not suitable for production with multiple instances
const memoryStore: Record<string, { count: number, resetAt: number }> = {};

// Clean up expired entries from memory store periodically
setInterval(() => {
  const now = Date.now();
  for (const key in memoryStore) {
    if (memoryStore[key].resetAt < now) {
      delete memoryStore[key];
    }
  }
}, 60 * 1000); // Clean up every minute

/**
 * Rate limit middleware for chat widget
 * Limits to 3 requests per minute per session
 */
export async function rateLimitMiddleware(
  req: NextRequest,
  maxRequests = 3,
  windowMs = 60 * 1000
) {
  // Extract session ID from request body or headers
  const body = await req.json().catch(() => ({}));
  const sessionId = body.sessionId || req.headers.get('x-session-id') || 'anonymous';
  
  // Use IP as fallback identifier
  const forwardedFor = req.headers.get('x-forwarded-for') || 'unknown';
  const identifier = sessionId !== 'anonymous' ? `widget:${sessionId}` : `widget:ip:${forwardedFor}`;
  
  let remaining = maxRequests;
  let resetAt = Date.now() + windowMs;
  let isRateLimited = false;

  try {
    // Try Redis first if available
    if (redis) {
      const key = `ratelimit:${identifier}`;
      
      // Get current count
      const currentCount = await redis.get<number>(key) || 0;
      
      if (currentCount >= maxRequests) {
        isRateLimited = true;
        // Get TTL for reset time calculation
        const ttl = await redis.ttl(key);
        resetAt = Date.now() + (ttl * 1000);
      } else {
        // Increment counter
        await redis.incr(key);
        // Set expiry if it's a new key
        if (currentCount === 0) {
          await redis.expire(key, windowMs / 1000);
        }
        remaining = maxRequests - (currentCount + 1);
      }
    } 
    // Fallback to memory store if Redis is not available
    else {
      const now = Date.now();
      
      // Initialize if not exists or expired
      if (!memoryStore[identifier] || memoryStore[identifier].resetAt < now) {
        memoryStore[identifier] = { count: 0, resetAt: now + windowMs };
      }
      
      if (memoryStore[identifier].count >= maxRequests) {
        isRateLimited = true;
        resetAt = memoryStore[identifier].resetAt;
      } else {
        memoryStore[identifier].count += 1;
        remaining = maxRequests - memoryStore[identifier].count;
      }
    }
  } catch (error) {
    edgeLogger.error('Rate limiting error', { error: String(error) });
    // Allow the request in case of errors
    isRateLimited = false;
    remaining = 1;
  }

  // If rate limited, return 429 response
  if (isRateLimited) {
    edgeLogger.warn('Rate limit exceeded', { identifier, resetAt });
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Please try again later',
        rateLimitInfo: {
          remaining: 0,
          resetAt
        }
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
          'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString()
        }
      }
    );
  }

  // Return null to continue processing the request
  req.headers.set('X-RateLimit-Limit', maxRequests.toString());
  req.headers.set('X-RateLimit-Remaining', remaining.toString());
  req.headers.set('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
  
  return null;
} 