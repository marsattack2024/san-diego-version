import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  try {
    let supabaseResponse = NextResponse.next({
      request,
    })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async getAll() {
            return request.cookies.getAll()
          },
          async setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.
    
    let user = null
    try {
      const authResult = await supabase.auth.getUser()
      user = authResult.data.user
    } catch (authError) {
      console.error('Error in auth.getUser()', authError)
      // Continue with user as null - will be treated as unauthenticated
    }

    // If the user is logged in and on the login page, redirect to chat
    if (user && request.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/chat', request.url))
    }

    // If the user is not logged in and trying to access protected routes, redirect to login
    if (
      !user &&
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/auth') &&
      !request.nextUrl.pathname.startsWith('/_next') &&
      !request.nextUrl.pathname.includes('favicon.ico')
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // If the user is logged in, pass the auth headers to API endpoints
    if (user) {
      // Pass auth headers to API routes for authenticated users
      if (request.nextUrl.pathname.startsWith('/api/')) {
        supabaseResponse.headers.set('x-auth-valid', 'true')
        supabaseResponse.headers.set('x-auth-time', Date.now().toString())
        supabaseResponse.headers.set('x-supabase-auth', user.id)
        
        // Check if user has a profile and set header
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .eq('user_id', user.id)
            .single();
          
          supabaseResponse.headers.set('x-has-profile', profile ? 'true' : 'false')
        } catch (error) {
          console.error('Error checking user profile:', error);
          // Default to false if there's an error
          supabaseResponse.headers.set('x-has-profile', 'false')
        }
      }
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is.
    return supabaseResponse
  } catch (error) {
    // Global error handling to prevent middleware crashes
    console.error('Critical error in middleware:', error)
    // Return a basic response that won't interrupt the application flow
    return NextResponse.next({
      request,
    })
  }
}

/**
 * Creates a Supabase client for middleware use
 * This follows the Supabase documentation for SSR
 */
export function createClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return request.cookies.getAll()
        },
        async setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}
