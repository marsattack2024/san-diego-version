import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin with comprehensive checks
async function isAdmin(supabase: any, userId: string) {
  console.log("[Dashboard API] Checking admin status for user:", userId);

  try {
    // Method 1: Use the RPC function that checks sd_user_roles
    const { data: rpcData, error: rpcError } = await supabase.rpc('is_admin', { uid: userId });

    if (rpcError) {
      console.error("[Dashboard API] Error checking admin via RPC:", rpcError);
    } else if (rpcData) {
      console.log("[Dashboard API] User is admin via RPC check");
      return true;
    }

    // Method 2: Check directly in the profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error("[Dashboard API] Error checking admin via profile:", profileError);
    } else if (profileData?.is_admin === true) {
      console.log("[Dashboard API] User is admin via profile flag");
      return true;
    }

    // Method 3: Check directly in the roles table
    const { data: roleData, error: roleError } = await supabase
      .from('sd_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error("[Dashboard API] Error checking admin via roles:", roleError);
    } else if (roleData) {
      console.log("[Dashboard API] User is admin via roles table");
      return true;
    }

    console.log("[Dashboard API] User is not admin by any verification method");
    return false;
  } catch (err) {
    console.error("[Dashboard API] Exception checking admin status:", err);
    return false;
  }
}

// GET /api/admin/dashboard - Get dashboard statistics
export async function GET(_request: Request): Promise<Response> {
  console.log("[Dashboard API] Request received");

  const cookieStore = await cookies();

  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  console.log("[Dashboard API] Using service key:", !!process.env.SUPABASE_KEY);
  console.log("[Dashboard API] Using URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  const supabase = createSupabaseServerClient(
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );

  // Verify the user is authenticated and an admin
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error("[Dashboard API] Error getting user:", userError);
    return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
  }

  const user = userData.user;
  if (!user) {
    console.log("[Dashboard API] No authenticated user found");
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("[Dashboard API] Authenticated user:", user.id);

  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    console.log("[Dashboard API] User is not an admin:", user.id);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  console.log("[Dashboard API] User is confirmed admin:", user.id);

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