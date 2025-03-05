'use client';

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { logger } from '@/lib/logger';

/**
 * Creates a Supabase client for browser environments
 * @returns Supabase browser client
 */
export function createBrowserClient() {
  try {
    return createSupabaseBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  } catch (error) {
    logger.error('Failed to create browser client', { error });
    throw error;
  }
}

// Also export as createClient for backward compatibility
export const createClient = createBrowserClient; 