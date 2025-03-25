import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'

export async function createClient() {
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
}

// Admin client for bypassing RLS (server-side only)
export const createAdminClient = () => {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!serviceRoleKey) {
      console.error('Missing Supabase service role key. Admin operations will fail.')
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
    }
    
    if (!supabaseUrl) {
      console.error('Missing Supabase URL. Admin operations will fail.')
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
    }
    
    return createServerClient(
      supabaseUrl,
      serviceRoleKey,
      {
        cookies: {
          async getAll() {
            return []
          },
          async setAll(cookiesToSet) {
            // Admin client doesn't need to set cookies
          }
        }
      }
    )
  } catch (error) {
    console.error('Failed to create admin client', error)
    throw error
  }
}
