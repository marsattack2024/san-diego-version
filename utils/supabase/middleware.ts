import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { edgeLogger } from '@/lib/logger/edge-logger'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Create standard client for auth
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not add any logic between createServerClient and
  // supabase.auth.getUser() to avoid session refresh issues
  const { data: { user } } = await supabase.auth.getUser()

  // Get the pathname from the request
  const { pathname } = request.nextUrl

  // Calculate auth completion time for client diagnostics
  const authCompletionTime = Date.now();
  const authTimestamp = authCompletionTime.toString();

  // Set a common header for ALL requests indicating auth check is complete
  // This is a critical signal that client code can use to determine when auth is ready
  request.headers.set('x-auth-ready', 'true');
  supabaseResponse.headers.set('x-auth-ready', 'true');
  request.headers.set('x-auth-ready-time', authTimestamp);
  supabaseResponse.headers.set('x-auth-ready-time', authTimestamp);

  // Set auth headers for authenticated users - BOTH request and response headers
  if (user) {
    // Common headers to set
    const authHeaders = {
      'x-supabase-auth': user.id,
      'x-auth-valid': 'true',
      'x-auth-time': authTimestamp,
      'x-auth-state': 'authenticated'
    };

    // Set headers on both request and response
    Object.entries(authHeaders).forEach(([key, value]) => {
      request.headers.set(key, value);
      supabaseResponse.headers.set(key, value);
    });

    // CRITICAL ADDITION: Check if user is an admin - but only if needed
    // Check if we already have a valid admin status cookie to avoid redundant checks
    const adminCookie = request.cookies.get('x-is-admin');
    const adminCookieTimestamp = request.cookies.get('x-is-admin-time');
    const now = Date.now();
    const adminCookieAge = adminCookieTimestamp ? now - parseInt(adminCookieTimestamp.value || '0') : Infinity;
    const adminCacheTime = 5 * 60 * 1000; // 5 minutes cache

    // Only check admin status if:
    // 1. No admin cookie exists, or
    // 2. Admin cookie is older than cache time, or
    // 3. Path indicates it's an admin page or admin-related API
    const needsAdminCheck = !adminCookie ||
      adminCookieAge > adminCacheTime ||
      request.nextUrl.pathname.startsWith('/admin') ||
      request.nextUrl.pathname.startsWith('/api/admin') ||
      request.nextUrl.pathname === '/api/auth/admin-status';

    if (needsAdminCheck) {
      edgeLogger.debug(`[updateSession] Checking admin status for: ${user.id.substring(0, 8)}...`, {
        category: 'auth'
      });

      // Create a service role client if the key is available - this bypasses RLS
      let adminClient = supabase;
      const hasServiceKey = !!process.env.SUPABASE_KEY;

      if (hasServiceKey) {
        // Create a service role client without cookies (we don't need them for this check)
        adminClient = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_KEY!, // Service role key bypasses RLS
          {
            // Minimal cookie config since we're just doing a quick DB check
            cookies: {
              getAll() { return [] },
              setAll() { /* noop */ }
            }
          }
        );
        edgeLogger.debug('[updateSession] Using service role key for admin check', {
          category: 'auth'
        });
      } else {
        edgeLogger.warn('[updateSession] ⚠️ No service role key available, admin check may fail due to RLS', {
          category: 'auth'
        });
      }

      // First try checking with RPC function (most reliable)
      const { data: rpcData, error: rpcError } = await adminClient.rpc('is_admin', { user_id: user.id });

      let isAdminStatus = 'false';
      if (!rpcError && rpcData === true) {
        isAdminStatus = 'true';
        edgeLogger.debug('[updateSession] User is admin via RPC check', {
          category: 'auth',
          userId: user.id
        });
      } else if (rpcError) {
        edgeLogger.warn('[updateSession] RPC admin check error', {
          category: 'auth',
          error: rpcError.message
        });

        // Fall back to profile table check if RPC fails
        const { data: profileData, error: profileError } = await adminClient
          .from('sd_user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();

        if (!profileError && profileData?.is_admin === true) {
          isAdminStatus = 'true';
          edgeLogger.debug('[updateSession] User is admin via profile check', {
            category: 'auth',
            userId: user.id
          });
        } else if (profileError) {
          edgeLogger.warn('[updateSession] Profile admin check error', {
            category: 'auth',
            error: profileError.message
          });
        }
      }

      // Set admin status in cookies with timestamp - for both request and response
      request.cookies.set('x-is-admin', isAdminStatus);
      request.cookies.set('x-is-admin-time', now.toString());
      supabaseResponse.cookies.set('x-is-admin', isAdminStatus, {
        path: '/',
        maxAge: 60 * 60 * 24, // Cookie lasts 24 hours, though we'll refresh it earlier
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
      supabaseResponse.cookies.set('x-is-admin-time', now.toString(), {
        path: '/',
        maxAge: 60 * 60 * 24,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });

      // Also set in headers for immediate use
      request.headers.set('x-is-admin', isAdminStatus);
      supabaseResponse.headers.set('x-is-admin', isAdminStatus);
    } else {
      // Reuse existing admin status from cookie
      const isAdminStatus = adminCookie?.value || 'false';
      request.headers.set('x-is-admin', isAdminStatus);
      supabaseResponse.headers.set('x-is-admin', isAdminStatus);

      // Only log when status is true to reduce noise
      if (isAdminStatus === 'true') {
        edgeLogger.debug('[updateSession] Using cached admin status from cookie (true)', {
          category: 'auth'
        });
      }
    }

    // Check if user has a profile
    const { data: profile } = await supabase
      .from('sd_user_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const hasProfile = profile ? 'true' : 'false';
    request.headers.set('x-has-profile', hasProfile);
    supabaseResponse.headers.set('x-has-profile', hasProfile);
  }
  // For unauthenticated users, set explicit headers for ALL API routes 
  // This ensures consistent auth header patterns for all routes
  else {
    // Set explicit "not authenticated" headers
    const unauthHeaders = {
      'x-supabase-auth': 'anonymous',
      'x-auth-valid': 'false',
      'x-auth-time': authTimestamp,
      'x-has-profile': 'false',
      'x-is-admin': 'false', // Explicitly set non-admin for unauthenticated users
      'x-auth-state': 'unauthenticated'
    };

    // Set on both request and response
    Object.entries(unauthHeaders).forEach(([key, value]) => {
      request.headers.set(key, value);
      supabaseResponse.headers.set(key, value);
    });

    // Special cookie presence check for debugging
    if (pathname.startsWith('/api/')) {
      // Make sure the request has the auth cookie info in a header
      // This helps with client-side debugging
      const cookieHeader = request.headers.get('cookie') || '';
      const hasAuthCookies = cookieHeader.includes('sb-') && cookieHeader.includes('-auth-token');
      request.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');
      supabaseResponse.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');

      // Log at debug level with proper category
      edgeLogger.debug(`Setting explicit unauthenticated headers for ${pathname}`, {
        category: 'auth',
        hasAuthCookies
      });
    }
  }

  // For history API calls, apply less strict redirection
  // This helps prevent redirect loops during authentication issues
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/signup') && // Allow access to signup page
    !pathname.startsWith('/auth') &&
    !pathname.includes('/_next') &&
    !pathname.includes('/api/history') && // Don't redirect history API calls
    !pathname.includes('/api/public')
  ) {
    // No user, redirect to login
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: Must return the supabaseResponse object as is to maintain
  // proper cookie handling for auth state
  return supabaseResponse
}

/**
 * Creates a Supabase client for middleware use
 * This follows the Supabase documentation for SSR
 */
export function createClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}
