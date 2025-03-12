import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  console.log("[isAdmin] Checking admin status for user:", userId);
  
  // Hard-code known admin users for now as a fallback
  const knownAdminIds = ['5c80df74-1e2b-4435-89eb-b61b740120e9'];
  
  try {
    // Use the RPC function that checks sd_user_roles
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });
    
    if (error) {
      console.error("[isAdmin] Error checking admin status:", error);
      // Fall back to hard-coded admin check
      return knownAdminIds.includes(userId);
    }
    
    console.log("[isAdmin] Admin role check result:", data);
    return !!data;
  } catch (err) {
    console.error("[isAdmin] Exception checking admin status:", err);
    // Fall back to hard-coded admin check
    return knownAdminIds.includes(userId);
  }
}

// POST /api/admin/users/create-profile - Create a profile for an existing auth user
export async function POST(request: Request) {
  // Get cookies with proper handler
  const cookieStore = await cookies();
  
  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
  
  // Verify the requester is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if requester is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden - You do not have admin privileges' }, { status: 403 });
  }
  
  try {
    // Get the user_id from request body
    const body = await request.json();
    const { user_id } = body;
    
    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    // Get user details from auth
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
    
    if (userError || !userData?.user) {
      console.error('Error getting auth user:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Extract name and email from auth user
    const email = userData.user.email || '';
    const name = userData.user.user_metadata?.name || email.split('@')[0] || 'Unknown';
    
    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', user_id)
      .single();
      
    if (existingProfile) {
      return NextResponse.json({ 
        message: 'Profile already exists for this user',
        user_id: user_id
      });
    }
    
    // Create placeholder profile
    const { data: profile, error: profileError } = await supabase
      .from('sd_user_profiles')
      .insert([{
        user_id: user_id,
        full_name: name,
        company_name: 'Pending Setup',
        company_description: 'Pending profile completion',
        location: '',
        website_url: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select();
    
    if (profileError) {
      console.error('Error creating profile:', profileError);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      message: 'Profile created successfully',
      profile: profile[0]
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}