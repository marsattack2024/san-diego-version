import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Generate a valid UUID v4 that works in Edge Runtime
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// List of paths that require authentication
const protectedPaths = ['/chat', '/settings', '/profile'];

// List of paths that should redirect to /chat if the user is already logged in
const authPaths = ['/login'];

// Profile path that needs special handling
const PROFILE_PATH = '/profile';

export async function middleware(request: NextRequest) {
  // Generate a unique request ID for tracing
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // Check if this is an important path for logging
  const isImportantPath = request.nextUrl.pathname.startsWith('/api/');
  
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    // Check for missing or placeholder values
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Missing Supabase credentials in middleware. Authentication will be disabled.');
      // Return the response without authentication checks
      return addTimingHeaders(supabaseResponse, startTime, requestId);
    }
    
    if (supabaseUrl === 'your-supabase-url-here' || 
        supabaseUrl.includes('your-supabase') || 
        supabaseKey.includes('your-supabase')) {
      console.warn('Using placeholder Supabase credentials in middleware. Authentication will be disabled.');
      // Return the response without authentication checks
      return addTimingHeaders(supabaseResponse, startTime, requestId);
    }
    
    // Validate URL format
    try {
      new URL(supabaseUrl);
    } catch (error) {
      console.error('Invalid Supabase URL format in middleware:', error instanceof Error ? error.message : String(error));
      // Return the response without authentication checks
      return addTimingHeaders(supabaseResponse, startTime, requestId);
    }

    const { pathname } = request.nextUrl;
    const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
    const isAuthPath = authPaths.some(path => pathname === path);
    
    // Skip auth check for non-protected paths to reduce auth requests
    if (!isProtectedPath && !isAuthPath) {
      // For unprotected routes (like static assets, public pages), 
      // we don't need to check auth
      return addTimingHeaders(supabaseResponse, startTime, requestId);
    }
    
    // Only create Supabase client if authentication is needed
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Check for auth state from headers sent by client
    // This is an optimization to reduce full auth checks
    const authToken = request.headers.get('x-supabase-auth') || '';
    const authTime = request.headers.get('x-auth-time') || '';
    let user = null;
    
    // Always perform full auth check in protected routes for security
    // This is crucial to prevent header spoofing
    if (isProtectedPath || isAuthPath) {
      // Get the current user - full auth check
      const { data } = await supabase.auth.getUser();
      user = data?.user;
      
      // Add auth state to response headers for client to cache
      if (user) {
        // Set secure headers that will be used for API routes
        supabaseResponse.headers.set('x-auth-valid', 'true');
        supabaseResponse.headers.set('x-auth-time', Date.now().toString());
        supabaseResponse.headers.set('x-supabase-auth', user.id);
      }
    } else if (authToken && authTime && 
               (Date.now() - parseInt(authTime, 10) < 5 * 60 * 1000)) {
      // For non-protected routes, we can use cached auth state if available
      // This optimizes things like API calls and asset loading
      user = { id: authToken }; // Simplified user object from cached token
    }

    // If the user is not logged in and trying to access a protected path
    if (isProtectedPath && !user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // If the user is logged in and trying to access an auth path
    if (isAuthPath && user) {
      return NextResponse.redirect(new URL('/chat', request.url));
    }
    
    // Check if the user has a profile when accessing protected content
    // But only if this is an actual chat page - skip for assets and API calls
    if (user && pathname.startsWith('/chat') && !pathname.includes('.') && !pathname.includes('/api/')) {
      // Get user profile - use a cached profile check if possible
      const hasProfileHeader = request.headers.get('x-has-profile');
      
      // For more reliable profile checking
      if (hasProfileHeader === 'true') {
        // If header indicates profile exists, trust it and continue
        // This speeds up navigation when we know the profile exists
        supabaseResponse.headers.set('x-has-profile', 'true');
      } else {
        // If no header or header is 'false', verify with database
        try {
          console.log('Debug: Checking profile for user:', user.id);
          const { data: profile, error } = await supabase
            .from('sd_user_profiles')
            .select('user_id') // Select user_id instead of id since that's the column we have
            .eq('user_id', user.id)
            .single();
            
          if (error) {
            console.error('Error checking profile:', error);
            // In case of error, don't block access - just continue
            supabaseResponse.headers.set('x-has-profile', 'true');
          } else {
            // Set header based on profile existence
            const hasProfile = !!profile;
            supabaseResponse.headers.set('x-has-profile', hasProfile ? 'true' : 'false');
              
            // Only redirect if explicitly no profile and not already on profile page
            if (!hasProfile && pathname !== PROFILE_PATH) {
              console.log('Debug: No profile found, redirecting to profile setup');
              return NextResponse.redirect(new URL('/profile', request.url));
            }
          }
        } catch (error) {
          console.error('Error checking user profile:', error);
          // On error, don't redirect - let the user continue
          // This prevents error loops
          supabaseResponse.headers.set('x-has-profile', 'true');
        }
      }
    }

    // Log only in development or for important paths,
    // to avoid excessive logging in production
    if (process.env.NODE_ENV === 'development' || isImportantPath) {
      edgeLogger.info('Middleware request', {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        important: isImportantPath,
        user: user ? { id: user.id } : null
      });
    }
    
    // Add timing header
    return addTimingHeaders(supabaseResponse, startTime, requestId);
  } catch (error) {
    console.error('Middleware error:', error instanceof Error ? error.message : String(error));
    // Return the response without authentication checks in case of error
    return addTimingHeaders(supabaseResponse, startTime, requestId);
  }
}

// Helper function to add timing headers
function addTimingHeaders(response: NextResponse, startTime: number, requestId: string) {
  const endTime = Date.now();
  response.headers.set('X-Middleware-Time', `${endTime - startTime}ms`);
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}; 