import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// This middleware handles authentication and authorization for admin routes
export async function middleware(request: NextRequest) {
  // Admin routes now rely on the main middleware.ts for authentication
  // and the api/middleware.ts for authorization

  // Just check if the required admin headers are present
  const userId = request.headers.get('x-supabase-auth');
  const isAdmin = request.headers.get('x-is-admin') === 'true';

  // Capture all auth-related headers for debugging
  const authHeaders: Record<string, string | null> = {};
  ['x-is-admin', 'x-supabase-auth', 'x-auth-valid', 'x-auth-state', 'x-has-profile'].forEach(headerName => {
    authHeaders[headerName] = request.headers.get(headerName);
  });

  // Log authentication information (but not tokens)
  edgeLogger.info('[Admin Middleware] Request authentication', {
    path: request.nextUrl.pathname,
    userId: userId ? userId.substring(0, 8) + '...' : 'none',
    isAdmin,
    authHeaders
  });

  if (!userId) {
    edgeLogger.warn('[Admin Middleware] Unauthorized - No authentication token', {
      path: request.nextUrl.pathname,
      headers: authHeaders
    });

    return NextResponse.json(
      { error: 'Unauthorized - No authentication token provided' },
      { status: 401 }
    );
  }

  if (!isAdmin) {
    edgeLogger.warn('[Admin Middleware] Forbidden - Not an admin user', {
      userId: userId.substring(0, 8) + '...',
      path: request.nextUrl.pathname,
      headers: authHeaders
    });

    return NextResponse.json(
      {
        error: 'Forbidden - Admin access required',
        details: 'The x-is-admin header was not set to true. This indicates that the user does not have admin privileges or the admin check in middleware.ts is not functioning correctly.'
      },
      { status: 403 }
    );
  }

  // User is authenticated and authorized as admin
  edgeLogger.debug('[Admin Middleware] Access granted', {
    userId: userId.substring(0, 8) + '...',
    path: request.nextUrl.pathname
  });

  return NextResponse.next();
}

// Configure which admin routes use this middleware
export const config = {
  matcher: '/api/admin/:path*',
};