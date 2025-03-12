import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc('is_admin', { uid: userId });
  if (error) return false;
  return !!data;
}

// POST /api/admin/users/invite - Invite a new user
export async function POST(request: Request) {
  // Get cookies with pre-fetching
  const cookieStore = cookies();
  const cookieList = await cookieStore.getAll();
  
  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return cookieList;
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
    
    // Invite the user using the admin API
    if (!process.env.SUPABASE_KEY) {
      return NextResponse.json({ 
        error: 'Service role key is required for user invitations' 
      }, { status: 500 });
    }
    
    try {
      // Use the inviteUserByEmail method which:
      // 1. Creates the user record in auth.users
      // 2. Generates a magic link token
      // 3. Sends an invitation email with the link
      // 4. Handles verification when the user clicks the link
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
      
      if (error) {
        // If the user already exists, return a friendly message
        if (error.message?.includes('already been registered') || 
            error.message?.includes('already exists')) {
          return NextResponse.json({ 
            message: 'User with this email already exists',
            status: 'exists'
          }, { status: 200 }); // Return 200 for this case
        }
        
        console.error('Error inviting user:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      // Verify we have user data
      if (!data?.user) {
        return NextResponse.json({ 
          error: 'Invitation succeeded but no user data returned' 
        }, { status: 500 });
      }
      
      console.log('User invited successfully:', data.user.id);
      
      // Return success response with the user data
      return NextResponse.json({ 
        message: 'User invitation email sent successfully',
        user: data.user
      });
    } catch (error) {
      console.error("Exception during user invitation:", error);
      return NextResponse.json({ 
        error: 'Exception during user invitation',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in invite user API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}