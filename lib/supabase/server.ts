import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { cache } from 'react';

/**
 * Creates a Supabase client for server environments with caching
 * Using React's cache function to automatically deduplicate requests
 * within the same render cycle
 * @returns Supabase server client
 */
export const createServerClient = cache(async () => {
  try {
    const cookieStore = await cookies();
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    // Check for missing or placeholder values
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Missing Supabase credentials. Some features will be disabled.');
    }
    
    if (supabaseUrl === 'your-supabase-url-here' || 
        (supabaseUrl && supabaseUrl.includes('your-supabase')) || 
        (supabaseKey && supabaseKey.includes('your-supabase'))) {
      console.warn('Using placeholder Supabase credentials. Some features will be disabled.');
    }
    
    // Validate URL format
    let validSupabaseUrl = supabaseUrl;
    try {
      if (supabaseUrl) {
        new URL(supabaseUrl);
      }
    } catch (error) {
      console.error('Invalid Supabase URL format:', error instanceof Error ? error.message : String(error));
      // Use a dummy URL that will pass URL validation but fail gracefully when used
      validSupabaseUrl = 'https://example.com';
    }
    
    return createSupabaseServerClient(
      validSupabaseUrl || 'https://example.com',
      supabaseKey || 'dummy-key',
      {
        cookies: {
          async getAll() {
            return await cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );
  } catch (error) {
    logger.error('Failed to create server client', { error });
    // Return a mock client that won't throw errors but won't work either
    return createMockSupabaseClient();
  }
});

/**
 * Creates a Supabase client with service role key to bypass RLS policies
 * This should ONLY be used for trusted server-side operations
 * that need to bypass Row Level Security
 * @returns Supabase admin client with service role
 */
export const createAdminClient = () => {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Check for missing key
    if (!serviceRoleKey) {
      logger.error('Missing Supabase service role key. Admin operations will fail.');
      return createMockAdminClient();
    }
    
    // Validate URL format
    const validSupabaseUrl = supabaseUrl;
    try {
      if (supabaseUrl) {
        new URL(supabaseUrl);
      } else {
        throw new Error('Missing Supabase URL');
      }
    } catch (error) {
      logger.error('Invalid Supabase URL format:', error instanceof Error ? error.message : String(error));
      return createMockAdminClient();
    }
    
    return createClient(validSupabaseUrl, serviceRoleKey);
  } catch (error) {
    logger.error('Failed to create admin client', { error });
    return createMockAdminClient();
  }
};

// Create a mock Supabase client that won't throw errors
function createMockSupabaseClient() {
  const mockMethods = {
    from: () => mockMethods,
    select: () => mockMethods,
    insert: () => Promise.resolve({ data: null, error: new Error('Supabase client unavailable') }),
    update: () => Promise.resolve({ data: null, error: new Error('Supabase client unavailable') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Supabase client unavailable') }),
    eq: () => mockMethods,
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null })
    }
  };
  
  return mockMethods as any;
}

// Create a mock Supabase admin client that won't throw errors
function createMockAdminClient() {
  const mockMethods = {
    from: () => mockMethods,
    select: () => mockMethods,
    insert: () => Promise.resolve({ data: null, error: new Error('Supabase admin client unavailable') }),
    update: () => Promise.resolve({ data: null, error: new Error('Supabase admin client unavailable') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Supabase admin client unavailable') }),
    eq: () => mockMethods,
    auth: {
      admin: {
        updateUserById: () => Promise.resolve({ data: null, error: new Error('Supabase admin client unavailable') })
      }
    },
    rpc: () => Promise.resolve({ data: null, error: new Error('Supabase admin client unavailable') })
  };
  
  return mockMethods as any;
} 