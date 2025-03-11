import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from './server';

/**
 * Helper function to get authenticated user for API routes
 * Minimizes duplicate auth code across API handlers
 * 
 * @param request The Next.js request object
 * @returns Object containing user, supabase client, and error response if auth failed
 */
export async function getAuthenticatedUser(request: NextRequest) {
  try {
    // Use our optimized createServerClient with React cache
    const serverClient = await createServerClient();
    
    // For auth-specific operations that need direct config
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // This can be ignored if you have middleware refreshing users
            }
          },
        },
      }
    );
    
    // For API routes, we need to verify the auth state
    // We'll make full auth checks more often to ensure security
    let user = null;
    
    // Only use header-based auth for non-critical operations
    // For most API routes, perform a full auth check
    const isAuthOperation = request.nextUrl.pathname.includes('/auth/') ||
                          request.nextUrl.pathname.includes('/login/');
                          
    // For auth-specific operations, always do a full check
    if (isAuthOperation) {
      // Full auth check for auth operations
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } else {
      // Check headers for potential optimization
      const authToken = request.headers.get('x-supabase-auth');
      const authTime = request.headers.get('x-auth-time');
      const authValid = request.headers.get('x-auth-valid');
      
      // Only trust headers set by our own middleware (x-auth-valid)
      // and only if they're recent
      const useCache = authToken && 
                      authTime && 
                      authValid === 'true' &&
                      (Date.now() - parseInt(authTime, 10) < 5 * 60 * 1000); // 5 minutes
                  
      if (useCache) {
        // Use cached auth - skip full auth check for non-critical ops
        user = { id: authToken };
        edgeLogger.debug('Using cached auth in API route', {
          userId: authToken,
          path: request.nextUrl.pathname
        });
      } else {
        // Full auth check
        const { data } = await supabase.auth.getUser();
        user = data?.user;
      }
    }
    
    if (!user) {
      return {
        user: null,
        supabase: null,
        errorResponse: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      };
    }
    
    return {
      user,
      supabase,
      serverClient, // Also return our cached server client
      errorResponse: null
    };
  } catch (error) {
    edgeLogger.error('Auth error in API route', { 
      error,
      path: request.nextUrl.pathname
    });
    
    return {
      user: null,
      supabase: null,
      errorResponse: NextResponse.json(
        { error: 'Authentication error' },
        { status: 500 }
      )
    };
  }
}