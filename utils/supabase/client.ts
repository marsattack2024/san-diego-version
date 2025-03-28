import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for client components
 * @returns Supabase browser client
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
