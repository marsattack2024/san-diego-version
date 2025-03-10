import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Generate a valid UUID v4 that works in Edge Runtime
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// List of paths that require authentication
const protectedPaths = ['/chat', '/settings', '/profile'];

// List of paths that should redirect to /chat if the user is already logged in
const authPaths = ['/login'];

// Profile path that needs special handling
const PROFILE_PATH = '/profile';

export async function middleware(request: NextRequest) {
  // Generate a unique request ID for tracing
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // Check if this is an important path for logging
  const isImportantPath = request.nextUrl.pathname.startsWith('/api/');
  
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create Supabase client with the recommended cookie handling pattern
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // Get the current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
  const isAuthPath = authPaths.some(path => pathname === path);

  // If the user is not logged in and trying to access a protected path
  if (isProtectedPath && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is logged in and trying to access an auth path
  if (isAuthPath && user) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }
  
  // Check if the user has a profile when accessing protected content
  if (user && pathname.startsWith('/chat')) {
    // Get user profile
    const { data: profile } = await supabase
      .from('sd_user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
      
    // If no profile exists, redirect to profile setup 
    if (!profile && pathname !== PROFILE_PATH) {
      return NextResponse.redirect(new URL('/profile', request.url));
    }
  }

  // Log only in development or for important paths,
  // to avoid excessive logging in production
  if (process.env.NODE_ENV === 'development' || isImportantPath) {
    edgeLogger.info('Middleware request', {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      important: isImportantPath,
      user: user ? { id: user.id } : null
    });
  }
  
  // Add timing header
  const endTime = Date.now();
  supabaseResponse.headers.set('X-Middleware-Time', `${endTime - startTime}ms`);
  supabaseResponse.headers.set('X-Request-Id', requestId);
  
  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}; 