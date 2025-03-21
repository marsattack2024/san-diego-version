import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Simple in-memory storage for rate limiting
// Note: This will reset when the server restarts
// For production, consider using Vercel KV or a Redis store
const rateLimitStore = new Map<string, Array<{time: number, count: number}>>();

// Clean up the rate limit store periodically (every 10 minutes)
// This helps prevent memory leaks in long-running environments
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    let keysRemoved = 0;
    
    // Remove entries older than 60 minutes
    rateLimitStore.forEach((entries, key) => {
      const validEntries = entries.filter(e => now - e.time < 60 * 60 * 1000);
      if (validEntries.length === 0) {
        rateLimitStore.delete(key);
        keysRemoved++;
      } else if (validEntries.length !== entries.length) {
        rateLimitStore.set(key, validEntries);
      }
    });
    
    if (keysRemoved > 0 && process.env.NODE_ENV === 'development') {
      console.log(`Rate limit store cleanup: removed ${keysRemoved} keys`);
    }
  }, 10 * 60 * 1000); // 10 minutes
}

/**
 * Rate limiting middleware for Next.js API routes
 * 
 * @param maxRequests Maximum number of requests allowed in the time window
 * @param windowMs Time window in milliseconds
 * @param identifierFn Function to generate a unique identifier for the request (defaults to IP address)
 * @returns A middleware function that can be used in API routes
 */
export function rateLimit(
  maxRequests: number = 10,
  windowMs: number = 60000,
  identifierFn?: (req: NextRequest) => string
) {
  return async (req: NextRequest) => {
    // Generate a unique identifier for the client
    // Default is IP address, but can be customized (e.g., to use user ID for logged-in users)
    const identifier = identifierFn 
      ? identifierFn(req) 
      : (req.headers.get('x-forwarded-for') || 
         req.headers.get('x-real-ip') || 
         'unknown-ip');
    
    const now = Date.now();
    
    // If no previous requests from this client, create a new entry
    if (!rateLimitStore.has(identifier)) {
      rateLimitStore.set(identifier, [{time: now, count: 1}]);
      return null; // Allow the request
    }
    
    // Get previous requests in the time window
    const requests = rateLimitStore.get(identifier) || [];
    const windowStart = now - windowMs;
    
    // Remove entries outside the current time window
    const validRequests = requests.filter(entry => entry.time >= windowStart);
    
    // Calculate total requests in the window
    const totalRequests = validRequests.reduce((sum, entry) => sum + entry.count, 0);
    
    // If the client has exceeded the rate limit
    if (totalRequests >= maxRequests) {
      // Log the rate limit hit
      edgeLogger.warn('Rate limit exceeded', {
        identifier,
        path: req.nextUrl.pathname,
        requestsInWindow: totalRequests,
        windowMs,
        maxRequests
      });
      
      // Add the current request to the log (even though it's being rejected)
      validRequests.push({ time: now, count: 0 }); // Count as 0 since it's rejected
      rateLimitStore.set(identifier, validRequests);
      
      // Return a 429 Too Many Requests response
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: 'Please try again later'
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(windowMs / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000).toString()
          }
        }
      );
    }
    
    // Allow the request and update the counter
    validRequests.push({ time: now, count: 1 });
    rateLimitStore.set(identifier, validRequests);
    
    // Calculate remaining requests
    const remainingRequests = Math.max(0, maxRequests - totalRequests - 1);
    
    // Return headers to inform the client about rate limiting
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', remainingRequests.toString());
    response.headers.set('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000).toString());
    
    return response;
  };
}

/**
 * Helper function to apply rate limiting to auth-related routes
 * Uses stricter limits for auth endpoints to prevent brute force attacks
 */
export function authRateLimit(req: NextRequest) {
  // Stricter limits for auth endpoints: 5 requests per minute
  return rateLimit(5, 60000)(req);
}

/**
 * Helper function to apply rate limiting to API routes
 * Uses moderate limits for standard API endpoints
 */
export function apiRateLimit(req: NextRequest) {
  // General API rate limit: 30 requests per minute
  return rateLimit(30, 60000)(req);
}

/**
 * Helper function to apply rate limiting to AI-related endpoints
 * Uses lower limits for expensive operations like AI generations
 */
export function aiRateLimit(req: NextRequest) {
  // AI endpoint rate limit: 10 requests per minute
  return rateLimit(10, 60000)(req);
} 