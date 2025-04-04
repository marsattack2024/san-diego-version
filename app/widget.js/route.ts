import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Get allowed origins from environment or use default with more permissive fallback
const getAllowedOrigins = () => {
  const originsFromEnv = process.env.WIDGET_ALLOWED_ORIGINS;
  return originsFromEnv
    ? originsFromEnv.split(',').map(origin => origin.trim())
    : ['https://marlan.photographytoprofits.com', 'https://programs.thehighrollersclub.io', 'http://localhost:3000', '*'];
};

// Function to add CORS headers to a response with improved origin handling
function addCorsHeaders(response: Response, req: Request): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();

  // Enhanced logic: If wildcard is in allowed origins OR the specific origin is allowed
  const isWildcardAllowed = allowedOrigins.includes('*');
  const isSpecificOriginAllowed = origin && allowedOrigins.includes(origin);

  const corsHeaders = new Headers(response.headers);

  // Set Access-Control-Allow-Origin with proper value based on request
  if (isSpecificOriginAllowed) {
    // When specific origin is allowed, use that exact origin (best practice)
    corsHeaders.set('Access-Control-Allow-Origin', origin);
  } else if (isWildcardAllowed) {
    // When wildcard is allowed and origin isn't specifically allowed, use wildcard
    corsHeaders.set('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.length > 0) {
    // Fallback to first allowed origin
    corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }

  // Set other CORS headers
  corsHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
  corsHeaders.set('Access-Control-Max-Age', '86400');

  // Enhanced logging for CORS issues in development
  if (process.env.NODE_ENV === 'development') {
    edgeLogger.debug('Widget CORS Headers set', {
      category: LOG_CATEGORIES.SYSTEM,
      origin,
      isWildcardAllowed,
      isSpecificOriginAllowed,
      allowOrigin: corsHeaders.get('Access-Control-Allow-Origin')
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders
  });
}

// Get CORS headers as an object for use in error responses
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();

  // Match same logic as addCorsHeaders function
  const isWildcardAllowed = allowedOrigins.includes('*');
  const isSpecificOriginAllowed = origin && allowedOrigins.includes(origin);

  let allowOrigin: string;

  if (isSpecificOriginAllowed) {
    allowOrigin = origin;
  } else if (isWildcardAllowed) {
    allowOrigin = '*';
  } else if (allowedOrigins.length > 0) {
    allowOrigin = allowedOrigins[0];
  } else {
    // Ultimate fallback if somehow allowedOrigins is empty
    allowOrigin = '*';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: Request): Promise<Response> {
  // Log for debugging
  edgeLogger.debug('Widget.js: Handling OPTIONS request', {
    category: LOG_CATEGORIES.SYSTEM
  });

  const response = new Response(null, {
    status: 204,
    headers: getCorsHeaders(req)
  });
  return response;
}

// Serve the widget script file
export async function GET(req: Request): Promise<Response> {
  try {
    // Log for debugging purposes
    edgeLogger.info('Widget.js: Redirecting to static widget script', {
      category: LOG_CATEGORIES.SYSTEM
    });

    // Redirect to the new v2 widget implementation
    // We use a symbolic link in the public folder to maintain backward compatibility
    // So both chat-widget.js and chat-widget-v2.js point to the same content
    const url = new URL('/widget/chat-widget-v2.js', req.url);

    // Create a redirect response (307 = temporary redirect)
    const response = Response.redirect(url, 307);

    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    // Enhanced error handling with detailed logging
    edgeLogger.error('Widget.js: Error serving widget script', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Return fallback script that logs the error but still with proper headers
    const errorResponse = new Response(
      `console.error("Failed to load chat widget script: ${errorMessage}");`,
      {
        status: 500,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          ...getCorsHeaders(req)
        },
      }
    );

    return errorResponse;
  }
} 