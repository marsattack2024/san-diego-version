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
    // Create Supabase client for auth
    const cookieStore = await cookies();
    const serverClient = createSupabaseServerClient(
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
    
    // Get the current user
    const { data: { user }, error } = await serverClient.auth.getUser();
    
    if (error || !user) {
      console.error('Authentication error:', error || 'No user found');
      
      return {
        user: null,
        serverClient,
        errorResponse: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      };
    }
    
    return {
      user,
      serverClient,
      errorResponse: null
    };
  } catch (error) {
    console.error('Error in authentication:', error);
    
    return {
      user: null,
      serverClient: null,
      errorResponse: NextResponse.json(
        { error: 'Authentication error' },
        { status: 500 }
      )
    };
  }
}