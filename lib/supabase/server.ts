import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

/**
 * Creates a Supabase client for server environments
 * @returns Supabase server client
 */
export async function createServerClient() {
  try {
    const cookieStore = await cookies();
    
    return createSupabaseServerClient(
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
    throw error;
  }
} 