import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'
import { type SupabaseClient } from '@supabase/supabase-js'
import { edgeLogger } from '@/lib/logger/edge-logger'
import { createStandardCookieHandler } from '@/lib/supabase/cookie-utils'
import { LOG_CATEGORIES } from '@/lib/logger/constants'

export const createClient = cache(async () => {
  const cookieStore = await cookies()

  // Debug logging for environment variables
  edgeLogger.info('Creating Supabase client', {
    category: LOG_CATEGORIES.SYSTEM,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    urlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 10) + '...',
    nodeEnv: process.env.NODE_ENV
  })

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: createStandardCookieHandler(cookieStore)
    }
  )
})

// Admin client for bypassing RLS (server-side only) while maintaining user auth
export const createAdminClient = cache(async () => {
  const cookieStore = await cookies()

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

    // Debug logging for admin client
    edgeLogger.info('Creating Supabase admin client', {
      category: LOG_CATEGORIES.SYSTEM,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasSupabaseKey: !!process.env.SUPABASE_KEY,
      hasServiceRoleKeySpecific: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      urlPrefix: supabaseUrl?.substring(0, 10) + '...',
      nodeEnv: process.env.NODE_ENV
    })

    if (!serviceRoleKey) {
      edgeLogger.error('Missing Supabase service role key. Admin operations will fail.', {
        category: LOG_CATEGORIES.SYSTEM,
        important: true
      })
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY environment variable')
    }

    if (!supabaseUrl) {
      edgeLogger.error('Missing Supabase URL. Admin operations will fail.', {
        category: LOG_CATEGORIES.SYSTEM,
        important: true
      })
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
    }

    // Create admin client but WITH cookies to maintain session
    return createServerClient(
      supabaseUrl,
      serviceRoleKey,
      {
        cookies: createStandardCookieHandler(cookieStore)
      }
    )
  } catch (error) {
    edgeLogger.error('Failed to create admin client', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error),
      important: true
    })
    throw error
  }
})
