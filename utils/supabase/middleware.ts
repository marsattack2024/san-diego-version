import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { edgeLogger } from '@/lib/logger/edge-logger'
import { createStandardCookieHandler, setEnhancedCookie } from '@/lib/supabase/cookie-utils'
import { LOG_CATEGORIES } from '@/lib/logger/constants'

export async function updateSession(request: NextRequest) {
  // Create a mutable copy of the request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', request.url);

  // Create a response that will be used to hold our updated cookies
  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  try {
    // Create standard client for auth using the standardized cookie handler
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            try {
              // First apply cookies to the request object to ensure they're available
              // for the current request
              cookiesToSet.forEach(({ name, value, options }) => {
                setEnhancedCookie(request.cookies, name, value, options);
              });

              // Then create a fresh response with updated cookies
              supabaseResponse = NextResponse.next({
                request: {
                  headers: requestHeaders,
                },
              });

              // Finally set cookies on the response using our enhanced cookie setter
              cookiesToSet.forEach(({ name, value, options }) => {
                setEnhancedCookie(supabaseResponse.cookies, name, value, options);
              });

              // Log the cookies we're setting for debugging
              if (cookiesToSet.some(cookie => cookie.name.includes('-auth-token'))) {
                edgeLogger.debug('Setting auth cookies in middleware', {
                  category: LOG_CATEGORIES.AUTH,
                  cookieCount: cookiesToSet.length,
                  cookieNames: cookiesToSet.map(c => c.name)
                });
              }
            } catch (error) {
              edgeLogger.error('Error in cookie setAll', {
                category: LOG_CATEGORIES.AUTH,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          },
        },
      }
    );

    // IMPORTANT: Do not add any logic between createServerClient and
    // supabase.auth.getUser() to avoid session refresh issues
    const { data: { user } } = await supabase.auth.getUser();

    // Get the pathname from the request
    const { pathname } = request.nextUrl;

    // Calculate auth completion time for client diagnostics
    const authCompletionTime = Date.now();
    const authTimestamp = authCompletionTime.toString();

    // Set a common header for ALL requests indicating auth check is complete
    // This is a critical signal that client code can use to determine when auth is ready
    requestHeaders.set('x-auth-ready', 'true');
    supabaseResponse.headers.set('x-auth-ready', 'true');
    requestHeaders.set('x-auth-ready-time', authTimestamp);
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
        requestHeaders.set(key, value);
        supabaseResponse.headers.set(key, value);
      });

      // ADMIN CHECK SIMPLIFIED: Check if user is an admin using profile table as single source of truth
      // Only check if:
      // 1. No admin cookie exists, or
      // 2. Admin cookie is older than cache time, or
      // 3. Path indicates it's an admin page or admin-related API
      const adminCookie = request.cookies.get('x-is-admin');
      const adminCookieTimestamp = request.cookies.get('x-is-admin-time');
      const now = Date.now();
      const adminCookieAge = adminCookieTimestamp ? now - parseInt(adminCookieTimestamp.value || '0') : Infinity;
      const adminCacheTime = 30 * 60 * 1000; // 30 minutes cache (extended from 5 minutes)

      const needsAdminCheck = !adminCookie ||
        adminCookieAge > adminCacheTime ||
        request.nextUrl.pathname.startsWith('/admin') ||
        request.nextUrl.pathname.startsWith('/api/admin') ||
        request.nextUrl.pathname === '/api/auth/admin-status';

      if (needsAdminCheck) {
        edgeLogger.debug(`[updateSession] Checking admin status for: ${user.id.substring(0, 8)}...`, {
          category: LOG_CATEGORIES.AUTH,
          level: 'debug'
        });

        // Create a service role client to bypass RLS
        let adminClient;
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
            category: LOG_CATEGORIES.AUTH,
            level: 'debug'
          });
        } else {
          adminClient = supabase;
          edgeLogger.warn('[updateSession] ⚠️ No service role key available, admin check may fail due to RLS', {
            category: LOG_CATEGORIES.AUTH,
            level: 'warn'
          });
        }

        // Check admin status directly in profile table - single source of truth
        const { data: profileData, error: profileError } = await adminClient
          .from('sd_user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();

        // Set admin status based on profile table result
        let isAdminStatus = 'false';

        if (!profileError && profileData?.is_admin === true) {
          isAdminStatus = 'true';
          edgeLogger.debug('[updateSession] User is admin via profile check', {
            category: LOG_CATEGORIES.AUTH,
            userId: user.id,
            level: 'debug'
          });
        } else if (profileError) {
          edgeLogger.warn('[updateSession] Profile admin check error', {
            category: LOG_CATEGORIES.AUTH,
            error: profileError.message,
            level: 'warn'
          });
        } else {
          edgeLogger.debug('[updateSession] User is not an admin', {
            category: LOG_CATEGORIES.AUTH,
            userId: user.id,
            level: 'debug'
          });
        }

        // Set admin status in cookies with timestamp - for both request and response
        setEnhancedCookie(request.cookies, 'x-is-admin', isAdminStatus);
        setEnhancedCookie(request.cookies, 'x-is-admin-time', now.toString());
        setEnhancedCookie(supabaseResponse.cookies, 'x-is-admin', isAdminStatus, {
          maxAge: 60 * 60 * 24, // Cookie lasts 24 hours, though we'll refresh it earlier
        });
        setEnhancedCookie(supabaseResponse.cookies, 'x-is-admin-time', now.toString(), {
          maxAge: 60 * 60 * 24,
        });

        // Also set in headers for immediate use
        requestHeaders.set('x-is-admin', isAdminStatus);
        supabaseResponse.headers.set('x-is-admin', isAdminStatus);
      } else {
        // Reuse existing admin status from cookie
        const isAdminStatus = adminCookie?.value || 'false';
        requestHeaders.set('x-is-admin', isAdminStatus);
        supabaseResponse.headers.set('x-is-admin', isAdminStatus);

        // Only log when status is true to reduce noise
        if (isAdminStatus === 'true') {
          edgeLogger.debug('[updateSession] Using cached admin status from cookie (true)', {
            category: LOG_CATEGORIES.AUTH,
            level: 'debug'
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
      requestHeaders.set('x-has-profile', hasProfile);
      supabaseResponse.headers.set('x-has-profile', hasProfile);

      // Set a session health check cookie to help client-side code detect auth status
      setEnhancedCookie(supabaseResponse.cookies, 'x-session-health', 'active', {
        maxAge: 60 * 60 * 24, // 24 hours
      });

      // Log that the session is authenticated and healthy
      edgeLogger.debug('Session authenticated and healthy', {
        category: LOG_CATEGORIES.AUTH,
        userId: user.id.substring(0, 8) + '...',
        path: pathname
      });
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
        requestHeaders.set(key, value);
        supabaseResponse.headers.set(key, value);
      });

      // Special cookie presence check for debugging
      if (pathname.startsWith('/api/')) {
        // Make sure the request has the auth cookie info in a header
        // This helps with client-side debugging
        const cookieHeader = request.headers.get('cookie') || '';
        const hasAuthCookies = cookieHeader.includes('sb-') && cookieHeader.includes('-auth-token');
        requestHeaders.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');
        supabaseResponse.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');

        // Log at debug level with proper category
        edgeLogger.debug(`Setting explicit unauthenticated headers for ${pathname}`, {
          category: LOG_CATEGORIES.AUTH,
          hasAuthCookies,
          level: 'debug'
        });
      }

      // Clear session health cookie for unauthenticated users
      setEnhancedCookie(supabaseResponse.cookies, 'x-session-health', '', {
        maxAge: 0, // Expire immediately
      });
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

      // Create a redirect response that preserves our auth headers
      const redirectResponse = NextResponse.redirect(url);

      // Copy all headers and cookies from our prepared response
      for (const [key, value] of supabaseResponse.headers.entries()) {
        redirectResponse.headers.set(key, value);
      }

      // Copy all cookies
      for (const cookie of supabaseResponse.cookies.getAll()) {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      }

      return redirectResponse;
    }

    // IMPORTANT: Must return the supabaseResponse object as is to maintain
    // proper cookie handling for auth state
    return supabaseResponse;
  } catch (error) {
    // Log the error but don't break the app
    edgeLogger.error('Error in updateSession middleware', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });

    // Return a response that can continue the request
    return supabaseResponse;
  }
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
      cookies: createStandardCookieHandler({
        getAll: () => request.cookies.getAll(),
        set: (name: string, value: string, options?: any) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      })
    }
  )
}
