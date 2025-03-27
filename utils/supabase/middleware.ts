import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

    // CRITICAL ADDITION: Check if user is an admin
    let isAdminStatus = 'false';
    try {
      console.log(`[updateSession] Checking admin status for: ${user.id.substring(0, 8)}...`);

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
        console.log('[updateSession] Using service role key for admin check');
      } else {
        console.log('[updateSession] ⚠️ No service role key available, admin check may fail due to RLS');
      }

      // First try checking with RPC function (most reliable)
      const { data: rpcData, error: rpcError } = await adminClient.rpc('is_admin', { uid: user.id });

      if (rpcError) {
        console.error('[updateSession] RPC admin check failed:', rpcError.message);

        // Fallback to checking profiles table directly
        const { data: profileData, error: profileError } = await adminClient
          .from('sd_user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();

        if (profileError) {
          console.error('[updateSession] Profile admin check failed:', profileError.message);

          // Last resort: check roles table directly
          const { data: roleData, error: roleError } = await adminClient
            .from('sd_user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle();

          if (roleError) {
            console.error('[updateSession] Role admin check failed:', roleError.message);
          } else if (roleData) {
            isAdminStatus = 'true';
            console.log('[updateSession] User is admin via role check');
          }
        } else if (profileData?.is_admin === true) {
          isAdminStatus = 'true';
          console.log('[updateSession] User is admin via profile check');
        }
      } else if (rpcData) {
        isAdminStatus = 'true';
        console.log('[updateSession] User is admin via RPC check');
      }

      // Specifically check if this is a widget admin page request
      if (pathname === '/admin/widget') {
        console.log(`[updateSession] 🔑 Admin check for WIDGET PAGE: ${isAdminStatus}`);
      }

    } catch (adminCheckError) {
      console.error('[updateSession] Error during admin check:', adminCheckError);
    }

    // Set admin status header on both request and response
    request.headers.set('x-is-admin', isAdminStatus);
    supabaseResponse.headers.set('x-is-admin', isAdminStatus);

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

      // Log at low frequency to reduce noise
      if (Math.random() < 0.01) {
        console.log(`Setting explicit unauthenticated headers for ${pathname}`, {
          hasAuthCookies
        });
      }
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
