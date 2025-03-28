import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'
import { type SupabaseClient } from '@supabase/supabase-js'

export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
})

// Admin client for bypassing RLS (server-side only) while maintaining user auth
export const createAdminClient = cache(async () => {
  const cookieStore = await cookies()

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

    if (!serviceRoleKey) {
      console.error('Missing Supabase service role key. Admin operations will fail.')
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY environment variable')
    }

    if (!supabaseUrl) {
      console.error('Missing Supabase URL. Admin operations will fail.')
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
    }

    // Create admin client but WITH cookies to maintain session
    return createServerClient(
      supabaseUrl,
      serviceRoleKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // This can be ignored in Server Components
            }
          }
        }
      }
    )
  } catch (error) {
    console.error('Failed to create admin client', error)
    throw error
  }
})
