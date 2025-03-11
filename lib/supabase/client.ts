'use client';

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { logger } from '@/lib/logger';

// Singleton instance for client-side
let clientInstance: any = null;

/**
 * Creates a Supabase client for browser environments
 * Uses a singleton pattern to avoid creating multiple instances
 * @returns Supabase browser client
 */
export function createBrowserClient() {
  // Return existing instance if available
  if (clientInstance) {
    return clientInstance;
  }
  
  try {
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
    
    // Create the client instance
    clientInstance = createSupabaseBrowserClient(
      validSupabaseUrl || 'https://example.com',
      supabaseKey || 'dummy-key'
    );
    
    return clientInstance;
  } catch (error) {
    logger.error('Failed to create browser client', { error });
    // Return a mock client that won't throw errors but won't work either
    clientInstance = createMockSupabaseClient();
    return clientInstance;
  }
}

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

// Also export as createClient for backward compatibility
export const createClient = createBrowserClient; 