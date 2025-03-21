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
const protectedPaths = ['/chat', '/settings', '/profile', '/admin'];

// List of paths that should redirect to /chat if the user is already logged in
const authPaths = ['/login'];

// Profile path that needs special handling
const PROFILE_PATH = '/profile';

// Cache duration in milliseconds (30 minutes)
const CACHE_DURATION = 30 * 60 * 1000;

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
               (Date.now() - parseInt(authTime, 10) < CACHE_DURATION)) {
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
    
    // Check for admin role if accessing admin routes
    if (user && pathname.startsWith('/admin')) {
      try {
        // First check admin status from metadata if available
        const isAdminMetadata = user.user_metadata?.is_admin === true;
        let isAdmin = isAdminMetadata;
        
        if (!isAdminMetadata) {
          // Check both profile and admin status in a single query when possible
          const { data: profile, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();
          
          isAdmin = profile?.is_admin === true;
          
          // If profile check fails or is_admin is false, try the RPC function as last resort
          if (profileError || !isAdmin) {
            const { data: adminCheck, error: adminError } = await supabase.rpc('is_admin', { uid: user.id });
            isAdmin = !!adminCheck;
            
            if (adminError) {
              throw adminError;
            }
          }
        }
        
        if (!isAdmin) {
          // Only log serious access attempts
          edgeLogger.warn('Unauthorized admin access attempt', {
            userId: user.id,
            path: pathname
          });
          return NextResponse.redirect(new URL('/unauthorized', request.url));
        }
        
        // Set admin flag in headers for client use
        supabaseResponse.headers.set('x-is-admin', 'true');
      } catch (error) {
        console.error('Error checking admin status:', error);
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }

    // If the user is logged in and trying to access an auth path
    if (isAuthPath && user) {
      return NextResponse.redirect(new URL('/chat', request.url));
    }
    
    // Skip profile checks for API routes and asset requests
    if (user && pathname.startsWith('/chat') && !pathname.includes('/api/') && !pathname.includes('.')) {
      // First, check user metadata for profile existence flag (fastest approach)
      // This avoids a database query in most cases
      const hasProfileMetadata = user.user_metadata?.has_profile ?? false;
      
      if (hasProfileMetadata) {
        // If metadata indicates profile exists, set the header and continue
        supabaseResponse.headers.set('x-has-profile', 'true');
        supabaseResponse.headers.set('x-profile-check-time', Date.now().toString());
        
        // Add profile summary header if available in metadata
        if (user.user_metadata?.profile_summary) {
          supabaseResponse.headers.set('x-profile-summary', JSON.stringify(user.user_metadata.profile_summary));
        }
      } else {
        // Get user profile from cached header if possible
        const hasProfileHeader = request.headers.get('x-has-profile');
        const headerTimestamp = request.headers.get('x-profile-check-time');
        const headerAge = headerTimestamp ? Date.now() - parseInt(headerTimestamp, 10) : Infinity;
        const isHeaderValid = hasProfileHeader === 'true' && headerAge < CACHE_DURATION;
        
        if (isHeaderValid) {
          // If valid header indicates profile exists, trust it and continue
          supabaseResponse.headers.set('x-has-profile', 'true');
          supabaseResponse.headers.set('x-profile-check-time', headerTimestamp || Date.now().toString());
        } else {
          // If no metadata and no valid header, check the database as last resort
          try {
            // Use the optimized RPC function first if available
            let hasProfile = false;
            try {
              const { data, error } = await supabase.rpc('has_profile', { uid: user.id });
              if (!error) {
                hasProfile = !!data;
              }
            } catch (rpcError) {
              // Only log RPC failures, not profile checks
              edgeLogger.warn('Middleware: RPC has_profile failed, falling back to direct query', { 
                userId: user.id 
              });
            }
            
            // Fall back to direct query if RPC fails
            if (!hasProfile) {
              const { data: profile, error } = await supabase
                .from('sd_user_profiles')
                .select('user_id')
                .eq('user_id', user.id)
                .single();
                
              if (error) {
                // Keep error logs for database errors
                edgeLogger.error('Middleware: Error checking profile', { error, userId: user.id });
                // In case of database error, redirect to profile page to be safe
                return NextResponse.redirect(new URL('/profile', request.url));
              }
              
              hasProfile = !!profile;
            }
            
            // Set header based on profile existence
            supabaseResponse.headers.set('x-has-profile', hasProfile ? 'true' : 'false');
            supabaseResponse.headers.set('x-profile-check-time', Date.now().toString());
              
            // Redirect if no profile and not already on profile page
            if (!hasProfile && pathname !== PROFILE_PATH) {
              return NextResponse.redirect(new URL('/profile', request.url));
            }
            
            // If profile exists but metadata doesn't indicate it, update user metadata
            // This sync happens in the background and doesn't block the response
            if (hasProfile && !hasProfileMetadata) {
              try {
                supabase.auth.updateUser({
                  data: { has_profile: true }
                }).then(() => {
                  // Success update logs not needed for MVP
                });
              } catch (updateError) {
                edgeLogger.warn('Middleware: Failed to update user metadata', { userId: user.id });
              }
            }
          } catch (error) {
            edgeLogger.error('Middleware: Exception checking user profile', { userId: user.id });
            // On unexpected error, redirect to profile page to be safe
            return NextResponse.redirect(new URL('/profile', request.url));
          }
        }
      }
    }

    // Only log in development or for truly important paths
    if (process.env.NODE_ENV === 'development' || isImportantPath) {
      edgeLogger.info('Middleware request', {
        requestId,
        path: request.nextUrl.pathname,
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