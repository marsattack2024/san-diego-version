import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  console.log("[isAdmin] Checking admin status for user:", userId);
  
  try {
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });
    
    if (error) {
      console.error("[isAdmin] Error checking admin status:", error);
      return false;
    }
    
    console.log("[isAdmin] Result:", !!data);
    return !!data;
  } catch (err) {
    console.error("[isAdmin] Exception checking admin status:", err);
    return false;
  }
}

// GET /api/admin/users - List all users
export async function GET(request: Request) {
  // Get cookies store
  const cookieStore = cookies();
  
  // Log some debug info
  console.log("Admin users API - Using service role key if available");
  console.log("Admin users API - Using URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("Admin users API - Service key exists:", !!process.env.SUPABASE_KEY);
  
  // Try to use service role key if available, otherwise fall back to anon key
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        async getAll() {
          const cookies = await cookieStore.getAll();
          return cookies;
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
    // Try to get the table names first to verify connection
    console.log("Admin API - Verifying database connection");
    const { data: tables, error: tablesError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .limit(1);
      
    if (tablesError) {
      console.error('Error connecting to database:', tablesError);
      return NextResponse.json({ error: 'Database connection failed', details: tablesError }, { status: 500 });
    }
    
    console.log("Admin API - Database connection successful");
    
    // Fetch all user profiles first, this is our primary data source
    console.log("Admin API - Fetching user profiles");
    const { data: profiles, error: profilesError } = await supabase
      .from('sd_user_profiles')
      .select('*');
    
    if (profilesError) {
      console.error('Error fetching user profiles:', profilesError);
      return NextResponse.json({ error: 'Failed to fetch users', details: profilesError }, { status: 500 });
    }
    
    console.log(`Admin API - Found ${profiles?.length || 0} user profiles`);
    
    // Get user IDs to fetch related auth data
    const userIds = profiles.map(profile => profile.user_id);
    
    // Fetch auth users using admin API for email and auth metadata
    let authUsers = [];
    if (userIds.length > 0) {
      try {
        // If we have service role key, we can use the admin API
        if (process.env.SUPABASE_KEY) {
          const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
          
          if (usersError) {
            console.error('Error fetching auth users:', usersError);
          } else {
            // Filter auth users to only those in our profiles
            authUsers = (users.users || []).filter(user => userIds.includes(user.id));
            console.log(`Admin API - Fetched ${authUsers.length} relevant auth users`);
          }
        } else {
          console.log("Admin API - No service role key, can't fetch auth users directly");
        }
      } catch (err) {
        console.error('Exception fetching auth users:', err);
      }
    }
    
    // Check admin status from both user_roles table and the is_admin flag
    let adminRoles = [];
    try {
      const { data: roles, error: rolesError } = await supabase
        .from('sd_user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .in('user_id', userIds);
        
      if (!rolesError && roles) {
        adminRoles = roles.map(r => r.user_id);
        console.log(`Admin API - Found ${adminRoles.length} admin roles`);
      }
    } catch (err) {
      console.error('Error fetching admin roles:', err);
    }
    
    // Combine profile data (primary) with auth data (secondary)
    const users = profiles.map(profile => {
      // Find matching auth user
      const authUser = authUsers.find(user => user.id === profile.user_id) || {};
      
      // Check admin status from both sources
      const isAdmin = adminRoles.includes(profile.user_id) || profile.is_admin === true;
      
      // Return a comprehensive user record with profile data as priority
      return {
        // Profile data (primary source)
        ...profile,
        // Auth data (enrich with email and auth timestamps)
        email: authUser.email,
        auth_created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        // Admin status (from either source)
        is_admin: isAdmin
      };
    });
    
    return NextResponse.json({ users });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in users API:', errorMessage);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: errorMessage 
    }, { status: 500 });
  }
}

// POST /api/admin/users - Create a new user
export async function POST(request: Request) {
  // Get cookies store
  const cookieStore = cookies();
  
  // Try to use service role key if available, otherwise fall back to anon key
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        async getAll() {
          const cookies = await cookieStore.getAll();
          return cookies;
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
    const body = await request.json();
    const { email, password, name, role } = body;
    
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    
    // Create user in Supabase Auth
    const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });
    
    if (authError) {
      console.error('Error creating user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
    
    // Create user profile
    const { error: profileError } = await supabase
      .from('sd_user_profiles')
      .insert([
        { user_id: newUser.user.id, name: name || email.split('@')[0] }
      ]);
    
    if (profileError) {
      console.error('Error creating user profile:', profileError);
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
    }
    
    // Assign role if provided
    if (role) {
      const { error: roleError } = await supabase
        .from('sd_user_roles')
        .insert([
          { user_id: newUser.user.id, role }
        ]);
      
      if (roleError) {
        console.error('Error assigning role:', roleError);
        return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
      }
    }
    
    return NextResponse.json({ user: newUser.user });
  } catch (error) {
    console.error('Error in create user API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}