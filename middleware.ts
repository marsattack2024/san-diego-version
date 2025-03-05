import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Generate a valid UUID v4 that works in Edge Runtime
function generateUUID() {
  // Generate random bytes
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  
  // Set version bits (4 for version 4 UUID)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant bits (10xx for standard UUID)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  // Format the UUID string with proper hyphens
  return [
    bytes.slice(0, 4).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), ''),
    bytes.slice(4, 6).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), ''),
    bytes.slice(6, 8).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), ''),
    bytes.slice(8, 10).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), ''),
    bytes.slice(10).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
  ].join('-');
}

export async function middleware(request: NextRequest) {
  // Skip static assets and HMR requests
  if (request.nextUrl.pathname.startsWith('/_next/') || 
      request.nextUrl.pathname.includes('.') ||
      request.nextUrl.pathname.includes('__webpack_hmr')) {
    return NextResponse.next();
  }
  
  // Create or use existing request ID
  // Only generate UUIDs for actual API requests or page requests, not for HMR
  let requestId = request.headers.get('x-request-id');
  if (!requestId && !request.nextUrl.pathname.includes('_next/data')) {
    requestId = generateUUID();
  }
  
  const startTime = performance.now();
  
  // Add context to downstream handlers
  const requestHeaders = new Headers(request.headers);
  if (requestId) {
    requestHeaders.set('x-request-id', requestId);
  }
  requestHeaders.set('x-request-start', startTime.toString());
  
  // Initialize Supabase response
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders }
  });

  // Create Supabase client
  const supabase = createSupabaseServerClient(
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Log only in development or for important paths,
  // but skip webpack HMR and internal Next.js requests
  const isImportantPath = request.nextUrl.pathname.includes('/api/') || 
                         request.nextUrl.pathname.includes('/chat');
  const isInternalNextRequest = request.nextUrl.pathname.includes('_next/data');
  
  if ((process.env.NODE_ENV === 'development' || isImportantPath) && !isInternalNextRequest) {
    edgeLogger.info('Request started', { 
      requestId: requestId || 'no-id',
      method: request.method,
      path: request.nextUrl.pathname,
      important: isImportantPath,
      user: user ? { id: user.id } : null
    });
  }
  
  // For MVP, we're not requiring authentication
  // Uncomment this block when ready to enforce authentication
  /*
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  */
  
  // Add timing header
  supabaseResponse.headers.set('Server-Timing', `request;dur=${Math.round(performance.now() - startTime)}`);
  
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}; 