import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'

export const createClient = cache(
  async () => {
    const cookieStore = await cookies()
    
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async getAll() {
            return cookieStore.getAll()
          },
          async setAll(cookiesToSet) {
            try {
              for (const { name, value, options } of cookiesToSet) {
                cookieStore.set(name, value, options)
              }
            } catch (error) {
              // This will throw in middleware as headers can't be set
              // after they've been sent to the client. We ignore this
              // as middleware will get the cookies on the next request
              console.warn('Warning: Could not set cookies in server action or middleware.', error)
            }
          },
        },
      }
    )
  }
)

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
