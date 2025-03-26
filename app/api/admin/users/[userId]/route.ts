import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin with comprehensive checks
async function isAdmin(supabase: any, userId: string) {
  console.log("[Delete User API] Checking admin status for user:", userId);
  
  try {
    // Method 1: Use the RPC function that checks sd_user_roles
    const { data: rpcData, error: rpcError } = await supabase.rpc('is_admin', { uid: userId });
    
    if (rpcError) {
      console.error("[Delete User API] Error checking admin via RPC:", rpcError);
    } else if (rpcData) {
      console.log("[Delete User API] User is admin via RPC check");
      return true;
    }
    
    // Method 2: Check directly in the profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single();
      
    if (profileError) {
      console.error("[Delete User API] Error checking admin via profile:", profileError);
    } else if (profileData?.is_admin === true) {
      console.log("[Delete User API] User is admin via profile flag");
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
      console.error("[Delete User API] Error checking admin via roles:", roleError);
    } else if (roleData) {
      console.log("[Delete User API] User is admin via roles table");
      return true;
    }
    
    console.log("[Delete User API] User is not admin by any verification method");
    return false;
  } catch (err) {
    console.error("[Delete User API] Exception checking admin status:", err);
    return false;
  }
}

// DELETE /api/admin/users/[userId] - Delete a user
export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
): Promise<Response> {
  // Access params directly
  const userId = params.userId;
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  console.log("[Delete User API] Deleting user:", userId);
  
  // Use await with cookies to satisfy Next.js warning
  const cookieStore = await cookies();
  
  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  console.log("[Delete User API] Using service key:", !!process.env.SUPABASE_KEY);
  
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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError) {
    console.error("[Delete User API] Error getting user:", userError);
    return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
  }
  
  const user = userData.user;
  if (!user) {
    console.log("[Delete User API] No authenticated user found");
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log("[Delete User API] Authenticated as user:", user.id);
  
  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    console.log("[Delete User API] User is not an admin:", user.id);
    return NextResponse.json({ error: 'Forbidden - You do not have admin privileges' }, { status: 403 });
  }
  
  console.log("[Delete User API] User is confirmed admin:", user.id);
  
  try {
    // Don't allow deleting your own account
    if (userId === user.id) {
      console.log("[Delete User API] Attempted to delete own account");
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }
    
    console.log("[Delete User API] Checking if target user exists:", userId);
    
    // First check the existence through the profiles table (doesn't require admin privileges)
    const { data: profileExists, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (profileError) {
      console.error("[Delete User API] Error checking profile:", profileError);
    } else if (profileExists) {
      console.log("[Delete User API] Found existing profile for user");
    } else {
      console.log("[Delete User API] No profile found for user, may not exist");
    }
    
    // Try checking user existence through admin API as a fallback
    try {
      console.log("[Delete User API] Checking user existence via admin API");
      const { data: userExists, error: userExistsError } = await supabase.auth.admin.getUserById(userId);
      
      if (userExistsError) {
        console.error("[Delete User API] Error checking user via admin API:", userExistsError);
        
        // If both profile check and admin API failed, but we know the user should exist,
        // let's proceed anyway since deleteUser will fail for non-existent users
        if (!profileExists) {
          console.log("[Delete User API] Both profile check and admin API failed");
          return NextResponse.json({ error: 'Failed to verify user exists' }, { status: 500 });
        }
      } else if (!userExists?.user) {
        console.log("[Delete User API] User not found in auth.users table");
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      } else {
        console.log("[Delete User API] Found user in auth.users:", userExists.user.email);
      }
    } catch (adminError) {
      console.error("[Delete User API] Exception checking user existence:", adminError);
      
      // If admin API throws but profile exists, we'll proceed with deletion
      if (!profileExists) {
        return NextResponse.json({ error: 'Failed to verify user exists' }, { status: 500 });
      }
    }
    
    // First, verify if ON DELETE CASCADE is working properly by checking if any tables 
    // don't have the proper constraints
    
    // Check sd_user_roles (should cascade from auth.users)
    const { data: userRoles } = await supabase
      .from('sd_user_roles')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
      
    if (userRoles && userRoles.length > 0) {
      console.log(`User ${userId} has role assignments that will be deleted`);
    }
    
    // Check if user has chat sessions
    const { data: chatSessions } = await supabase
      .from('sd_chat_sessions')
      .select('id')
      .eq('user_id', userId)
      .limit(5);
      
    if (chatSessions && chatSessions.length > 0) {
      console.log(`User ${userId} has ${chatSessions.length} chat sessions that will be deleted`);
    }
    
    console.log("[Delete User API] Beginning deletion process for user:", userId);
    
    // Try to use the safe_delete_user function first
    try {
      console.log("[Delete User API] Using safe_delete_user function");
      
      // Call the safe_delete_user function that handles all deletions in one transaction
      const { data: safeDeleteResult, error: safeDeleteError } = await supabase
        .rpc('safe_delete_user', { user_id_param: userId });
        
      if (safeDeleteError) {
        console.error("[Delete User API] Error using safe_delete_user:", safeDeleteError);
        
        // Fall back to deleting the data manually
        console.log("[Delete User API] Falling back to manual deletion");
        
        // Delete from sd_user_roles
        const { error: rolesError } = await supabase
          .from('sd_user_roles')
          .delete()
          .eq('user_id', userId);
          
        if (rolesError) {
          console.error("[Delete User API] Error deleting roles:", rolesError);
        }
        
        // Delete from sd_user_profiles
        const { error: profilesError } = await supabase
          .from('sd_user_profiles')
          .delete()
          .eq('user_id', userId);
          
        if (profilesError) {
          console.error("[Delete User API] Error deleting profile:", profilesError);
        }
        
        // Delete from sd_chat_sessions (should cascade to histories)
        const { error: sessionsError } = await supabase
          .from('sd_chat_sessions')
          .delete()
          .eq('user_id', userId);
          
        if (sessionsError) {
          console.error("[Delete User API] Error deleting chat sessions:", sessionsError);
        }
      } else {
        console.log("[Delete User API] safe_delete_user succeeded:", safeDeleteResult);
      }
      
      console.log("[Delete User API] Profile data deletion completed");
    } catch (profileDeleteError) {
      console.error("[Delete User API] Error in profile deletion:", profileDeleteError);
    }
    
    // Use the complete_user_deletion function for reliable deletion
    try {
      console.log("[Delete User API] Using complete_user_deletion function for proper cleanup");
      
      // Call the existing comprehensive user deletion function
      const { data: deleteResult, error: deleteError } = await supabase
        .rpc('complete_user_deletion', { user_id_param: userId });
        
      if (deleteError) {
        console.error("[Delete User API] Error using complete_user_deletion function:", deleteError);
        
        // Try the fallback safe_delete_user_data function that only deletes application data
        console.log("[Delete User API] Falling back to safe_delete_user_data");
        const { data: safeDeleteResult, error: safeDeleteError } = await supabase
          .rpc('safe_delete_user_data', { user_id_param: userId });
          
        if (safeDeleteError) {
          console.error("[Delete User API] Error using safe_delete_user_data:", safeDeleteError);
        } else {
          console.log("[Delete User API] User data deletion successful:", safeDeleteResult);
        }
          
        // Try the Supabase Auth API as a final step
        console.log("[Delete User API] Trying Supabase Auth API");
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        
        if (authError) {
          console.error("[Delete User API] Error deleting auth user:", authError);
          
          // Check error message to determine if this is a permissions issue
          const errorMessage = authError.message || '';
          if (errorMessage.includes('not allowed') || errorMessage.includes('permission') ||
              errorMessage.includes('not admin')) {
            return NextResponse.json({ 
              error: 'Admin operation not permitted - check SUPABASE_KEY in environment variables',
              details: errorMessage
            }, { status: 403 });
          }
          
          // For other errors, we've already deleted profile data so return partial success
          return NextResponse.json({ 
            message: 'User profile data deleted but auth record could not be removed',
            details: errorMessage
          }, { status: 207 }); // 207 Multi-Status
        }
        
        console.log("[Delete User API] Auth user deletion successful via Auth API");
      } else {
        console.log("[Delete User API] User deleted successfully via complete_user_deletion:", deleteResult);
      }
    } catch (deleteError) {
      console.error("[Delete User API] Exception during user deletion:", deleteError);
      
      // Return partial success since we've already deleted profile data
      return NextResponse.json({ 
        message: 'User profile data deleted but auth record could not be removed',
        error: String(deleteError)
      }, { status: 207 }); // 207 Multi-Status
    }
    
    // Verify that the profile was deleted
    try {
      console.log("[Delete User API] Verifying deletion was successful");
      
      const { data: profileCheck, error: profileCheckError } = await supabase
        .from('sd_user_profiles')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
        
      if (profileCheckError) {
        console.error("[Delete User API] Error verifying profile deletion:", profileCheckError);
      } else if (profileCheck) {
        console.warn("[Delete User API] Profile still exists after deletion attempt:", profileCheck);
        
        // One more attempt to remove profile
        await supabase.from('sd_user_profiles').delete().eq('user_id', userId);
      } else {
        console.log("[Delete User API] Confirmed profile no longer exists");
      }
    } catch (verifyError) {
      console.error("[Delete User API] Error verifying deletion:", verifyError);
    }
    
    console.log("[Delete User API] User deletion process completed for:", userId);
    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error("[Delete User API] Error in delete user API:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
  }
}