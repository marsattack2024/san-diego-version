// Use dynamic imports for Next.js types
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLogger } from '@/utils/server-logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('middleware');

export function middleware(request: NextRequest) {
  const startTime = performance.now();
  const requestId = request.headers.get('x-request-id') || uuidv4();
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const url = request.nextUrl.pathname;
  const method = request.method;
  
  // Create request-specific logger
  const log = logger.child({ 
    requestId, 
    clientIp,
    userAgent,
    url,
    method
  });
  
  // Skip logging for static assets
  if (
    url.startsWith('/_next/static') || 
    url.startsWith('/static') || 
    url.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }
  
  log.info('Request received');
  
  // Add requestId to headers for downstream usage
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  
  // Create the response
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  // Add timing header to the response
  response.headers.set('Server-Timing', `request;dur=${Math.round(performance.now() - startTime)}`);
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
