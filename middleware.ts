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
  
  // Special bypass for widget chat API to allow anonymous access
  if (pathname.startsWith('/api/widget-chat')) {
    console.log('Bypassing auth middleware for Widget Chat API');
    return;
  }
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (icons, images, etc.)
     * - api routes that don't require auth
     * - auth routes
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/|public/|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Explicitly include API routes that need auth
    '/api/chat/:path*',
    '/api/history/:path*',
    // Explicitly excluding Perplexity API and Widget Chat API from auth middleware
    // '/api/perplexity/:path*',
  ],
}