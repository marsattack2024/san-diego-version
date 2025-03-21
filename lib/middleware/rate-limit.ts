import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Simple in-memory storage for rate limiting
// Note: This will reset when the server restarts
// For production, consider using Vercel KV or a Redis store
const rateLimitStore = new Map<string, Array<{time: number, count: number}>>();

// Pending requests cache to handle request coalescing
// This helps prevent concurrent requests from hitting rate limits on initial page load
const pendingRequestsCache = new Map<string, Promise<any>>();

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
    
    // Clean up expired pending requests (older than 10 seconds)
    const pendingExpired: string[] = [];
    pendingRequestsCache.forEach((_, key) => {
      const [path, timestamp] = key.split('|');
      if (now - parseInt(timestamp) > 10000) {
        pendingExpired.push(key);
      }
    });
    
    pendingExpired.forEach(key => pendingRequestsCache.delete(key));
    
    if ((keysRemoved > 0 || pendingExpired.length > 0) && process.env.NODE_ENV === 'development') {
      console.log(`Rate limit store cleanup: removed ${keysRemoved} keys, ${pendingExpired.length} pending requests`);
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
    // In development, use higher limits to prevent disruption during local testing
    if (process.env.NODE_ENV === 'development') {
      // Significantly higher limits for development
      maxRequests = maxRequests * 10; // 10x instead of 5x
    }
    
    // Check if this is a page load burst (multiple concurrent requests from same user)
    // Handle these more gracefully by allowing bursts on initial load
    const isInitialPageLoad = req.headers.get('x-page-load') === 'true' || 
                             req.headers.get('sec-fetch-dest') === 'document';
    const isCriticalRequest = req.nextUrl.pathname.includes('/api/chat/session');
    
    if ((isInitialPageLoad || isCriticalRequest) && process.env.NODE_ENV === 'development') {
      // For development page loads or critical requests, bypass rate limiting
      const response = NextResponse.next();
      response.headers.set('X-Rate-Limit-Bypass', 'development-page-load');
      return response;
    }
    
    // Generate a unique identifier for the client
    // Default is IP address, but can be customized (e.g., to use user ID for logged-in users)
    const identifier = identifierFn 
      ? identifierFn(req) 
      : (req.headers.get('x-forwarded-for') || 
         req.headers.get('x-real-ip') || 
         'unknown-ip');
    
    const path = req.nextUrl.pathname;
    
    // Request coalescing - if there's an identical request in progress from same user,
    // use the same response instead of counting it as a new request
    const requestKey = `${identifier}|${path}|${Date.now()}`;
    
    if (pendingRequestsCache.has(requestKey)) {
      try {
        return await pendingRequestsCache.get(requestKey);
      } catch (err) {
        // If the cached promise rejects, continue with normal processing
      }
    }
    
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
    
    // Determine if the request is allowed
    const isAllowed = totalRequests < maxRequests;
    
    if (!isAllowed) {
      // Log the rate limit hit
      edgeLogger.warn('Rate limit exceeded', {
        identifier,
        path: req.nextUrl.pathname,
        requestsInWindow: totalRequests,
        windowMs,
        maxRequests,
        isDevelopment: process.env.NODE_ENV === 'development'
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
    
    const pendingPromise = Promise.resolve(response);
    pendingRequestsCache.set(requestKey, pendingPromise);
    
    return response;
  };
}

/**
 * Helper function to apply rate limiting to auth-related routes
 * Uses stricter limits for auth endpoints to prevent brute force attacks
 */
export function authRateLimit(req: NextRequest) {
  // Stricter limits for auth endpoints: 15 requests per minute (up from 5)
  return rateLimit(15, 60000)(req);
}

/**
 * Helper function to apply rate limiting to API routes
 * Uses moderate limits for standard API endpoints
 */
export function apiRateLimit(req: NextRequest) {
  // General API rate limit: 120 requests per minute (doubled from 60)
  return rateLimit(120, 60000)(req);
}

/**
 * Helper function to apply rate limiting to AI-related endpoints
 * Uses lower limits for expensive operations like AI generations
 */
export function aiRateLimit(req: NextRequest) {
  // AI endpoint rate limit: 40 requests per minute (doubled from 20)
  // Allow more burst capacity for streaming responses and concurrent requests
  return rateLimit(40, 60000)(req);
} 