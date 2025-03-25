import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (icons, images, etc.)
     * - api routes that don't require auth
     * - auth routes
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/|public/|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}