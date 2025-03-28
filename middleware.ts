import { edgeLogger } from './lib/logger/edge-logger';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip excessive logging for common paths
  const isCommonPath = pathname.includes('favicon') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.svg');

  if (!isCommonPath) {
    edgeLogger.debug('[Middleware] Processing request', {
      category: 'auth',
      path: pathname
    });
  }

  // Special bypass for internal API endpoints that handle their own auth
  if (
    pathname.startsWith('/api/perplexity') ||
    pathname.startsWith('/api/auth/admin-status')
  ) {
    if (!isCommonPath) {
      edgeLogger.debug('Bypassing auth middleware for internal API', {
        category: 'auth',
        path: pathname
      });
    }
    return;
  }

  // Special bypass for widget-related paths to allow anonymous access
  if (
    pathname.startsWith('/api/widget-chat') ||
    pathname.startsWith('/widget/') || // Trailing slash prevents matching '/admin/widget'
    pathname === '/widget.js' ||
    pathname === '/debug.js'
  ) {
    if (!isCommonPath) {
      edgeLogger.debug('Bypassing auth middleware for Widget features', {
        category: 'auth',
        path: pathname
      });
    }
    return;
  }

  // Only log admin page processing for debugging purposes
  if (pathname.startsWith('/admin')) {
    edgeLogger.debug('Processing admin page with normal auth flow', {
      category: 'auth',
      path: pathname
    });
  }

  // The session cookie is updated/refreshed in the response
  const response = await updateSession(request);

  // Log authentication results for debugging
  if (pathname.startsWith('/admin')) {
    edgeLogger.debug('Admin page auth processed', {
      category: 'auth',
      path: pathname,
      status: response?.status || 'No response'
    });

    // Generic debug info for all admin routes
    const redirectUrl = response?.headers?.get('location');
    if (response?.redirected || redirectUrl) {
      edgeLogger.debug('Admin route is being redirected', {
        category: 'auth',
        path: pathname,
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