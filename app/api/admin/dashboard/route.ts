import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc('is_admin', { uid: userId });
  if (error) return false;
  return !!data;
}

// GET /api/admin/dashboard - Get dashboard statistics
export async function GET(request: Request) {
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  try {
    // Get user count
    const { count: userCount, error: userError } = await supabase
      .from('sd_user_profiles')
      .select('*', { count: 'exact', head: true });
    
    if (userError) {
      console.error('Error fetching user count:', userError);
      return NextResponse.json({ error: 'Failed to fetch user count' }, { status: 500 });
    }
    
    // Get chat count
    const { count: chatCount, error: chatError } = await supabase
      .from('sd_chat_histories')
      .select('*', { count: 'exact', head: true });
    
    if (chatError) {
      console.error('Error fetching chat count:', chatError);
      // Don't fail the whole request, just set count to 0
    }
      
    // Get recent activity
    const { data: recentActivity, error: activityError } = await supabase
      .from('sd_chat_histories')
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (activityError) {
      console.error('Error fetching recent activity:', activityError);
      // Don't fail the whole request, just set activity to empty array
    }
    
    // Get admin count from roles table
    const { count: adminRolesCount, error: adminRolesError } = await supabase
      .from('sd_user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
      
    if (adminRolesError) {
      console.error('Error fetching admin roles count:', adminRolesError);
      // Don't fail the whole request
    }
    
    // Also check for admin flag in profiles table
    const { count: adminProfilesCount, error: adminProfilesError } = await supabase
      .from('sd_user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', true);
      
    if (adminProfilesError) {
      console.error('Error fetching admin profiles count:', adminProfilesError);
      // Don't fail the whole request
    }
    
    // Use the maximum of the two counts to account for both sources
    const adminCount = Math.max(adminRolesCount || 0, adminProfilesCount || 0);
    
    // Return dashboard stats directly
    return NextResponse.json({
      userCount: userCount || 0,
      chatCount: chatCount || 0,
      adminCount: adminCount || 0,
      recentActivity: recentActivity || []
    });
  } catch (error) {
    console.error('Error in dashboard API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}