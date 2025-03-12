import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This middleware handles authentication and authorization for admin routes
export async function middleware(request: NextRequest) {
  // Get Authorization header or auth cookie
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Check for admin-specific header or cookie
  const authHeader = request.headers.get('x-supabase-auth');
  const authCookie = request.cookies.get('sb-uwdpcfysqkkfkwssjzhw-auth-token')?.value;
  
  // Log authentication information (but not tokens)
  console.log('[Admin Middleware] Request path:', request.nextUrl.pathname);
  console.log('[Admin Middleware] Auth header exists:', !!authHeader);
  console.log('[Admin Middleware] Auth cookie exists:', !!authCookie);
  
  if (!authHeader && !authCookie) {
    return NextResponse.json(
      { error: 'Unauthorized - No authentication token provided' },
      { status: 401 }
    );
  }
  
  try {
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // If we have valid authentication, check for admin role 
    let user;
    
    if (authHeader) {
      // Admin header approach
      user = { id: authHeader };
    } else if (authCookie) {
      // Try to get user from session
      const { data, error } = await supabase.auth.getUser();
      
      if (error || !data.user) {
        console.error('[Admin Middleware] Auth error:', error);
        return NextResponse.json(
          { error: 'Unauthorized - Invalid authentication token' },
          { status: 401 }
        );
      }
      
      user = data.user;
    }
    
    // Now check if the user is an admin
    if (user?.id) {
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin', { uid: user.id });
      
      console.log('[Admin Middleware] User ID:', user.id);
      console.log('[Admin Middleware] Is admin:', isAdmin);
      console.log('[Admin Middleware] Admin error:', adminError);
      
      if (adminError || !isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden - Admin access required' },
          { status: 403 }
        );
      }
      
      // User is authenticated and authorized as admin
      return NextResponse.next();
    }
    
    // Should not normally reach here
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('[Admin Middleware] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error in admin middleware' },
      { status: 500 }
    );
  }
}

// Configure which admin routes use this middleware
export const config = {
  matcher: '/api/admin/:path*',
};