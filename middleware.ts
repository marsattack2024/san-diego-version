import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log('[Middleware] Processing request for:', pathname);

  // Special bypass for Perplexity API to allow internal server-to-server communication
  if (pathname.startsWith('/api/perplexity')) {
    console.log('Bypassing auth middleware for Perplexity API');
    return;
  }

  // Special bypass for widget-related paths to allow anonymous access
  if (
    pathname.startsWith('/api/widget-chat') ||
    pathname.startsWith('/widget/') || // Trailing slash prevents matching '/admin/widget'
    pathname === '/widget.js' ||
    pathname === '/debug.js'
  ) {
    console.log('Bypassing auth middleware for Widget features:', pathname);
    return;
  }

  // Log authentication results for admin pages
  if (pathname.startsWith('/admin')) {
    console.log(`[Middleware] Processing admin page ${pathname} with normal auth flow`);
  }

  // The session cookie is updated/refreshed in the response
  const response = await updateSession(request);

  // Log authentication results for debugging
  if (pathname.startsWith('/admin')) {
    console.log(`[Middleware] Admin page ${pathname} auth processed with status:`, response?.status || 'No response');

    // Generic debug info for all admin routes
    const redirectUrl = response?.headers?.get('location');
    if (response?.redirected || redirectUrl) {
      console.log(`[Middleware] ⚠️ Admin route ${pathname} is being redirected`, {
        redirectUrl: redirectUrl || 'unknown',
        responseStatus: response?.status
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/ (app images)
     * - styles/ (app styles)
     * - We also exclude /api/check-status since it's used for health checks
     * - We must exclude the widget script path specifically so it can be loaded on external sites
     */
    '/((?!_next/static|_next/image|favicon.ico|api/check-status|widget/chat-widget.js|images/|styles/).*)',
  ],
};