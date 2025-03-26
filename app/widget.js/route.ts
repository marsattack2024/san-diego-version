import { NextRequest } from 'next/server'

// Get allowed origins from environment or use default
const getAllowedOrigins = () => {
  const originsFromEnv = process.env.WIDGET_ALLOWED_ORIGINS;
  return originsFromEnv 
    ? originsFromEnv.split(',').map(origin => origin.trim())
    : ['https://marlan.photographytoprofits.com', 'https://programs.thehighrollersclub.io', 'http://localhost:3000', '*'];
};

// Function to add CORS headers to a response
function addCorsHeaders(response: Response, req: NextRequest): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  
  // If allowedOrigins includes '*' or the specific origin, allow it
  const isAllowedOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  
  const corsHeaders = new Headers(response.headers);
  
  if (isAllowedOrigin) {
    corsHeaders.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  
  corsHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
  corsHeaders.set('Access-Control-Max-Age', '86400');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders
  });
}

// Get CORS headers as an object for use in error responses
function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? (origin || '*') : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: NextRequest) {
  const response = new Response(null, { 
    status: 204,
    headers: getCorsHeaders(req)
  });
  return response;
}

export const runtime = 'edge';

// Serve the widget script file
export async function GET(req: NextRequest) {
  try {
    // Log for debugging purposes
    console.log('Widget.js route handler: Serving widget script directly');
    
    // Get the static file URL
    const url = new URL('/widget/chat-widget.js', req.url);
    
    // Fetch the file content directly
    const scriptResponse = await fetch(url);
    
    if (!scriptResponse.ok) {
      throw new Error(`Failed to fetch widget script: ${scriptResponse.status} ${scriptResponse.statusText}`);
    }
    
    // Get the script content
    const scriptContent = await scriptResponse.text();
    
    // Create a new response with the script content and proper headers
    const response = new Response(scriptContent, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
    
    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    // Enhanced error handling with detailed logging
    console.error('Widget.js route: Error serving widget script:', error);
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