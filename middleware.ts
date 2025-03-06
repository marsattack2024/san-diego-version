import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
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
const protectedPaths = ['/chat', '/settings'];

// List of paths that should redirect to /chat if the user is already logged in
const authPaths = ['/login'];

export async function middleware(request: NextRequest) {
  // Generate a unique request ID for tracing
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // Check if this is an important path for logging
  const isImportantPath = request.nextUrl.pathname.startsWith('/api/');
  
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client
  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name, options) {
          supabaseResponse.cookies.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );

  // Get the current user's session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
  const isAuthPath = authPaths.some(path => pathname === path);

  // If the user is not logged in and trying to access a protected path
  if (isProtectedPath && !session) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is logged in and trying to access an auth path
  if (isAuthPath && session) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  // Log only in development or for important paths,
  // to avoid excessive logging in production
  if (process.env.NODE_ENV === 'development' || isImportantPath) {
    edgeLogger.info('Middleware request', {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      important: isImportantPath,
      user: session ? { id: session.user.id } : null
    });
  }
  
  // Add timing header
  const endTime = Date.now();
  supabaseResponse.headers.set('X-Middleware-Time', `${endTime - startTime}ms`);
  supabaseResponse.headers.set('X-Request-Id', requestId);
  
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
     * - api (API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api).*)',
  ],
}; 