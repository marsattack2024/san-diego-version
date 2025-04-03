import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from './lib/logger/edge-logger';
import { LOG_CATEGORIES } from './lib/logger/constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create response and middleware client with proper session handling
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, any>) {
          // Setting cookies in both the request and response
          request.cookies.set({
            name,
            value,
            ...options
          });
          response.cookies.set({
            name,
            value,
            ...options
          });
        },
        remove(name: string, options: Record<string, any>) {
          // Remove from both request and response
          request.cookies.set({
            name,
            value: '',
            ...options
          });
          response.cookies.set({
            name,
            value: '',
            ...options
          });
        },
      },
    }
  );

  try {
    // This updates session cookies AND validates the session with Supabase server
    // More secure than using getSession() as it validates the JWT with Supabase
    const { data: { user } } = await supabase.auth.getUser();

    // Calculate auth completion time for client diagnostics
    const authCompletionTime = Date.now();
    const authTimestamp = authCompletionTime.toString();

    // Set auth-ready header for client-side detection
    response.headers.set('x-auth-ready', 'true');
    response.headers.set('x-auth-ready-time', authTimestamp);

    // Set auth headers based on user status
    if (user) {
      response.headers.set('x-supabase-auth', user.id);
      response.headers.set('x-auth-valid', 'true');
      response.headers.set('x-auth-time', authTimestamp);
      response.headers.set('x-auth-state', 'authenticated');

      // Check admin status directly from user JWT claims (after Phase 6 implementation)
      // This avoids redundant database checks
      const isAdmin = user.app_metadata?.is_admin === true;
      response.headers.set('x-is-admin', isAdmin ? 'true' : 'false');

      // Set session health cookie to help client-side detection
      response.cookies.set('x-session-health', 'active', {
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
        sameSite: 'lax',
        httpOnly: false, // Accessible from JS for health checks
        secure: process.env.NODE_ENV === 'production',
      });

      edgeLogger.debug('Session authenticated', {
        category: LOG_CATEGORIES.AUTH,
        userId: user.id.substring(0, 8) + '...',
        path: pathname
      });
    } else {
      // No authenticated user - set explicit headers
      response.headers.set('x-supabase-auth', 'anonymous');
      response.headers.set('x-auth-valid', 'false');
      response.headers.set('x-auth-time', authTimestamp);
      response.headers.set('x-auth-state', 'unauthenticated');
      response.headers.set('x-is-admin', 'false');

      // Clear session health cookie
      response.cookies.set('x-session-health', '', {
        maxAge: 0, // Expire immediately
        path: '/',
      });

      // If accessing a protected route, redirect to login
      if (!user) {
        edgeLogger.debug('Redirecting unauthenticated user to login', {
          category: LOG_CATEGORIES.AUTH,
          path: pathname
        });

        const redirectUrl = new URL('/login', request.url);
        redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
        return NextResponse.redirect(redirectUrl);
      }
    }

    return response;
  } catch (error) {
    edgeLogger.error('Middleware error processing request', {
      category: LOG_CATEGORIES.AUTH,
      path: pathname,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });

    // Return next response if middleware fails to prevent breaking the app
    return response;
  }
}

// Configure middleware to run ONLY on routes that require authentication
export const config = {
  matcher: [
    // Include paths requiring auth
    '/chat/:path*',
    '/admin/:path*',
    '/api/chat/:path*',
    '/api/history/:path*',
  ],
};