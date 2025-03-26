import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

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
