import { NextRequest } from 'next/server'

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
    // Log for debugging
    console.log('Widget.js route handler: Serving widget script');
    
    // Read the actual file content from the filesystem
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public/widget/chat-widget.js');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('Widget.js route: File not found at path:', filePath);
      throw new Error('Widget script file not found');
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    const response = new Response(fileContent, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Shorter cache time for debugging
        'X-Content-Type-Options': 'nosniff',
      },
    });
    
    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    console.error('Widget.js route: Error serving widget script:', error)
    const errorResponse = new Response('console.error("Failed to load chat widget script");', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    });
    return addCorsHeaders(errorResponse, req);
  }
} 