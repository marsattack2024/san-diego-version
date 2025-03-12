import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc('is_admin', { uid: userId });
  if (error) return false;
  return !!data;
}

// DELETE /api/admin/users/[userId] - Delete a user
export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const userId = params.userId;
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    // Don't allow deleting your own account
    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }
    
    // Check if the user exists first
    const { data: userExists, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError) {
      console.error('Error checking user existence:', userError);
      return NextResponse.json({ error: 'Failed to verify user exists' }, { status: 500 });
    }
    
    if (!userExists?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // First, verify if ON DELETE CASCADE is working properly by checking if any tables 
    // don't have the proper constraints
    const tablesWithoutCascade = [];
    
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
    
    // Delete the user from Supabase Auth
    // This should cascade to all related tables if foreign keys are set up correctly
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Error deleting user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
    
    // Verify that the profile was deleted via cascade
    const { data: profileCheck, error: profileCheckError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .single();
      
    if (!profileCheckError && profileCheck) {
      // Profile wasn't deleted by cascade, attempt to use the complete_user_deletion function
      console.warn(`Cascade delete failed for user profile ${userId}, using complete_user_deletion function`);
      
      const { data: deleteResult, error: deleteFunctionError } = await supabase
        .rpc('complete_user_deletion', { user_id: userId });
      
      if (deleteFunctionError) {
        console.error('Error using complete_user_deletion function:', deleteFunctionError);
        
        // Last resort: try to manually delete from each table
        console.warn('Attempting manual deletion from each table...');
        
        try {
          // Delete from sd_user_profiles
          await supabase.from('sd_user_profiles').delete().eq('user_id', userId);
          
          // Delete from sd_user_roles
          await supabase.from('sd_user_roles').delete().eq('user_id', userId);
          
          // Delete from sd_chat_sessions (should cascade to histories)
          await supabase.from('sd_chat_sessions').delete().eq('user_id', userId);
          
          console.log('Manual deletion complete');
        } catch (e) {
          console.error('Error in manual deletion:', e);
        }
      } else {
        console.log('Used complete_user_deletion function:', deleteResult);
      }
    }
    
    // Final verification - if any orphaned records remain, log it
    const { data: orphanedData, error: orphanError } = await supabase
      .from('orphaned_user_data')
      .select('*');
      
    if (!orphanError && orphanedData) {
      const hasOrphans = orphanedData.some(record => record.orphaned_count > 0);
      if (hasOrphans) {
        console.warn('Orphaned data detected after user deletion:', orphanedData);
      }
    }
    
    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error in delete user API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}