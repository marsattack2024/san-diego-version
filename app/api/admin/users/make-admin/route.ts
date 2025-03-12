import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc('is_admin', { uid: userId });
  if (error) return false;
  return !!data;
}

// POST /api/admin/users/make-admin - Make a user an admin
export async function POST(request: Request) {
  const cookieStore = cookies();
  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        async getAll() {
          return await cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
  
  // Verify the user is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden - You do not have admin privileges' }, { status: 403 });
  }
  
  try {
    const body = await request.json();
    const { email } = body;
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    
    // Call the make_user_admin function
    const { data, error } = await supabase.rpc('make_user_admin', { user_email: email });
    
    if (error) {
      console.error('Error making user admin:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Return success response
    return NextResponse.json({ message: data });
    
  } catch (error) {
    console.error('Error in make-admin API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}