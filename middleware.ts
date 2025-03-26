import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Only log non-history paths or log at a much lower frequency for history
  const { pathname } = request.nextUrl;
  
  if (!pathname.startsWith('/api/history') || Math.random() < 0.01) {
    console.log(`Middleware processing path: ${pathname}`);
  }
  
  // Special bypass for Perplexity API to allow internal server-to-server communication
  if (pathname.startsWith('/api/perplexity')) {
    console.log('Bypassing auth middleware for Perplexity API');
    return;
  }
  
  // Special bypass for widget-related paths to allow anonymous access
  if (
    pathname.startsWith('/api/widget-chat') || 
    pathname.startsWith('/widget') || 
    pathname === '/widget.js' ||
    pathname === '/debug.js' ||
    pathname.includes('.html') ||
    // Additional check for direct file access
    pathname.includes('/chat-widget.js')
  ) {
    console.log('Bypassing auth middleware for Widget features:', pathname);
    return;
  }
  
  // The admin/widget path does not need special handling here as it should
  // go through normal authentication via updateSession like other admin paths
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Match all paths except specific static assets
    '/((?!_next/static|_next/image|favicon.ico).*)',
    
    // Explicitly include API routes that need auth
    '/api/chat/:path*',
    '/api/history/:path*',
  ],
}