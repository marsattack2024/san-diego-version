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
  
  // Log authentication information (but not tokens)
  if (process.env.NODE_ENV === 'development') {
    edgeLogger.debug('[Admin Middleware] Request path:', { 
      path: request.nextUrl.pathname,
      userId: userId || 'none',
      isAdmin: isAdmin || false
    });
  }
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - No authentication token provided' },
      { status: 401 }
    );
  }
  
  if (!isAdmin) {
    edgeLogger.warn('Unauthorized admin access attempt in admin middleware', {
      userId,
      path: request.nextUrl.pathname
    });
    
    return NextResponse.json(
      { error: 'Forbidden - Admin access required' },
      { status: 403 }
    );
  }
  
  // User is authenticated and authorized as admin
  return NextResponse.next();
}

// Configure which admin routes use this middleware
export const config = {
  matcher: '/api/admin/:path*',
};