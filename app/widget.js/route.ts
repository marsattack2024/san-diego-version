import { NextRequest } from 'next/server'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'

// Get allowed origins from environment or use default
const getAllowedOrigins = () => {
  const originsFromEnv = process.env.WIDGET_ALLOWED_ORIGINS;
  return originsFromEnv 
    ? originsFromEnv.split(',') 
    : ['https://marlan.photographytoprofits.com', 'https://programs.thehighrollersclub.io', 'http://localhost:3000', '*'];
};

// Function to add CORS headers to a response
function addCorsHeaders(response: Response, req: NextRequest): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');
  
  const corsHeaders = new Headers(response.headers);
  
  if (isAllowedOrigin) {
    corsHeaders.set('Access-Control-Allow-Origin', origin);
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

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: NextRequest) {
  const response = new Response(null, { status: 204 });
  return addCorsHeaders(response, req);
}

// Serve the widget script file
export async function GET(req: NextRequest) {
  try {
    // Point directly to where the file is actually being built
    const filePath = join(process.cwd(), 'public/widget/chat-widget.js')
    console.log('Widget.js route: Attempting to serve widget from path:', filePath);
    
    // Check if file exists before reading
    try {
      const stats = statSync(filePath);
      console.log('Widget.js route: File exists, size:', stats.size, 'bytes');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Widget.js route: File does not exist at path:', filePath, 'Error:', errorMessage);
    }
    
    const scriptContent = readFileSync(filePath, 'utf-8')
    console.log('Widget.js route: Successfully read file, content length:', scriptContent.length);
    
    // Create response with proper content type and caching headers
    const response = new Response(scriptContent, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
    
    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    console.error('Widget.js route: Error serving widget script:', error)
    const errorResponse = new Response('console.error("Failed to load chat widget script");', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    })
    return addCorsHeaders(errorResponse, req);
  }
} 