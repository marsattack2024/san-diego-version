import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { authCache } from '@/lib/auth/auth-cache';

/**
 * Get the currently authenticated user with caching
 * @param ttlMs Cache TTL in milliseconds (defaults to 60 seconds)
 */
export async function getCachedUser(ttlMs: number = 60000) {
  // Check if we have a valid cached user
  const cachedUser = authCache.get(ttlMs);
  if (cachedUser) {
    console.log('Using cached user');
    return cachedUser;
  }
  
  // Cache miss - fetch from Supabase
  try {
    console.log('Fetching fresh user data');
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) throw error;
    
    if (user) {
      // Store user in cache
      authCache.set(user);
    }
    
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Helper function to get authenticated user for API routes
 * Minimizes duplicate auth code across API handlers
 * 
 * @param request The Next.js request object
 * @returns Object containing user, supabase client, and error response if auth failed
 */
export async function getAuthenticatedUser(request: NextRequest) {
  try {
    // Initialize server client using cookies from request
    const cookieStore = await cookies();
    
    // Enhanced logging for cookie debugging
    const allCookies = cookieStore.getAll();
    const hasCookies = allCookies.length > 0;
    const hasAuthCookie = allCookies.some(c => c.name.includes('auth-token'));
    
    edgeLogger.debug('Cookie information in getAuthenticatedUser', {
      cookieCount: allCookies.length,
      hasCookies,
      hasAuthCookie,
      path: request.nextUrl.pathname,
      method: request.method
    });
    
    if (!hasCookies || !hasAuthCookie) {
      edgeLogger.warn('Missing authentication cookies', {
        path: request.nextUrl.pathname,
        method: request.method
      });
      
      return {
        user: null,
        serverClient: null,
        errorResponse: new Response(
          JSON.stringify({ 
            error: 'Not authenticated',
            message: 'Missing authentication cookies'
          }),
          { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        ),
      };
    }
    
    const supabase = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (e) {
              // Log error for better debugging
              edgeLogger.error('Error setting cookies in getAuthenticatedUser', {
                error: e,
                path: request.nextUrl.pathname
              });
            }
          },
        },
      }
    );
    
    // Fetch user information
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    
    // Log access attempts for debugging
    if (userError) {
      edgeLogger.warn('Auth error while getting user', { 
        errorMessage: userError.message,
        path: request.nextUrl.pathname
      });
    }
    
    if (!user) {
      edgeLogger.warn('No authenticated user found for API request', { 
        path: request.nextUrl.pathname,
        method: request.method
      });
      
      // Return unauthorized response
      return {
        user: null,
        serverClient: null,
        errorResponse: new Response(
          JSON.stringify({ 
            error: 'Not authenticated',
            message: 'You must be logged in to access this endpoint'
          }),
          { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        ),
      };
    }
    
    // Create authenticated server client
    const serverClient = await createServerClient();
    
    // Return user and client
    return {
      user,
      serverClient,
      errorResponse: null,
    };
  } catch (error) {
    // Handle unexpected errors
    edgeLogger.error('Unexpected authentication error', { 
      error,
      path: request.nextUrl.pathname,
      method: request.method,
      errorMessage: typeof error === 'object' ? (error as any).message : String(error)
    });
    
    // Return server error response
    return {
      user: null,
      serverClient: null,
      errorResponse: new Response(
        JSON.stringify({ 
          error: 'Authentication error',
          message: 'An error occurred during authentication'
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      ),
    };
  }
}