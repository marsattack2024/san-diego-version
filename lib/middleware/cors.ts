import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

/**
 * CORS configuration options
 */
export interface CorsOptions {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number; // in seconds
  developmentMode?: boolean; // Allow * in development
}

/**
 * Default CORS configuration that balances security with ease of use for MVP
 */
export const defaultCorsOptions: CorsOptions = {
  allowedOrigins: [
    // Application domains
    'https://marlan.photographytoprofits.com',
    // Vercel deployment URL
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    // Local development
    'http://localhost:3000'
  ].filter(Boolean) as string[],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowCredentials: true,
  maxAge: 86400, // 24 hours
  developmentMode: process.env.NODE_ENV === 'development'
};

/**
 * CORS middleware for Next.js API routes and App Router handlers
 * 
 * This middleware can be applied in two ways:
 * 1. As a standalone middleware in API routes
 * 2. As part of a middleware chain using our existing middleware pattern
 * 
 * @param request The Next.js request object
 * @param options CORS configuration options
 * @returns A response with CORS headers or null to continue to the next middleware
 */
export async function corsMiddleware(
  request: NextRequest,
  options: CorsOptions = defaultCorsOptions
): Promise<NextResponse | null> {
  const { allowedOrigins, allowedMethods, allowedHeaders, allowCredentials, maxAge, developmentMode } = 
    { ...defaultCorsOptions, ...options };
  
  // Get the origin from the request
  const origin = request.headers.get('origin') || '';
  
  // Create a response that will be returned for OPTIONS requests
  // or modified and passed to the next middleware for other requests
  const response = NextResponse.next();
  
  // Determine which origin to allow
  let allowOrigin = 'null';
  
  // In development mode, allow * or the requesting origin
  if (developmentMode) {
    allowOrigin = '*';
  } else if (allowedOrigins?.includes(origin)) {
    // In production, only allow origins in the whitelist
    allowOrigin = origin;
  } else if (allowedOrigins?.length === 0) {
    // If no origins specified, use the Vercel URL or our main domain
    const vercelUrl = process.env.VERCEL_URL;
    allowOrigin = vercelUrl 
      ? `https://${vercelUrl}` 
      : 'https://marlan.photographytoprofits.com';
  }
  
  // Set CORS headers on the response
  response.headers.set('Access-Control-Allow-Origin', allowOrigin);
  
  // Only set additional headers if we're allowing this origin
  if (allowOrigin !== 'null') {
    if (allowedMethods?.length) {
      response.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
    }
    
    if (allowedHeaders?.length) {
      response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    }
    
    if (allowCredentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    
    if (maxAge) {
      response.headers.set('Access-Control-Max-Age', maxAge.toString());
    }
  }
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    edgeLogger.debug('Handled CORS preflight request', { 
      origin, 
      path: request.nextUrl.pathname,
      allowOrigin
    });
    
    // For OPTIONS requests, return the response with headers but no body
    return new NextResponse(null, {
      status: 204,
      headers: response.headers
    });
  }
  
  // For other methods, return null to continue to the next middleware
  // with the CORS headers already set
  return null;
}

/**
 * Standalone CORS handler for API routes that don't use our middleware pattern
 * 
 * @param request The Next.js request object
 * @param options CORS configuration options
 * @returns A response with CORS headers for OPTIONS requests, or null otherwise
 */
export async function handleCors(
  request: NextRequest,
  options: CorsOptions = defaultCorsOptions
): Promise<NextResponse | null> {
  // Apply CORS middleware
  const corsResponse = await corsMiddleware(request, options);
  
  // If it's an OPTIONS request, return the response
  if (corsResponse && request.method === 'OPTIONS') {
    return corsResponse;
  }
  
  // For other methods, return null to continue processing
  return null;
}

/**
 * Create a middleware function that applies CORS and then continues to the next middleware
 * Compatible with our existing middleware pattern
 * 
 * @param options CORS configuration options
 * @returns A middleware function that can be used in the middleware chain
 */
export function createCorsMiddleware(options: CorsOptions = defaultCorsOptions) {
  return async function(request: NextRequest): Promise<NextResponse | null> {
    // Apply CORS middleware
    const corsResponse = await corsMiddleware(request, options);
    
    // If CORS middleware returned a response (for OPTIONS), return it
    if (corsResponse) {
      return corsResponse;
    }
    
    // Otherwise, continue to the next middleware
    return null;
  };
} 