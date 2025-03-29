// Script to test admin status determination
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env'),
  override: true
});

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_KEY in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to check if a user is an admin (same as in dashboard route)
async function isAdmin(userId: string) {
  console.log(`[TEST] Checking admin status for user: ${userId}`);
  
  try {
    // Method 1: Use the RPC function that checks sd_user_roles
    const { data: rpcData, error: rpcError } = await supabase.rpc('is_admin', { uid: userId });
    
    if (rpcError) {
      console.error('[TEST] Error checking admin via RPC:', rpcError);
    } else if (rpcData) {
      console.log('[TEST] User is admin via RPC check');
      return true;
    }
    
    // Method 2: Check directly in the profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single();
      
    if (profileError) {
      console.error('[TEST] Error checking admin via profile:', profileError);
    } else if (profileData?.is_admin === true) {
      console.log('[TEST] User is admin via profile flag');
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
      console.error('[TEST] Error checking admin via roles:', roleError);
    } else if (roleData) {
      console.log('[TEST] User is admin via roles table');
      return true;
    }
    
    console.log('[TEST] User is not admin by any verification method');
    return false;
  } catch (err) {
    console.error('[TEST] Exception checking admin status:', err);
    return false;
  }
}

// Get all users and check their admin status
async function testAllUsers() {
  // Get all auth users
  const { data: usersData, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  const users = usersData.users;
  console.log(`Found ${users.length} users to check`);
  
  // Check each user
  for (const user of users) {
    console.log('\n-----------------------------------');
    console.log(`Testing user: ${user.email} (${user.id})`);
    
    const isAdminResult = await isAdmin(user.id);
    console.log(`Admin check result: ${isAdminResult}`);
    
    // Get raw profile data using the special function
    try {
      const { data: rawProfile, error: rawError } = await supabase.rpc(
        'get_raw_profile_data',
        { user_id_param: user.id }
      );
      
      if (rawError) {
        console.error('Error getting raw profile:', rawError);
      } else {
        console.log('Raw profile data:', rawProfile);
      }
    } catch (err) {
      console.error('Error executing raw profile query:', err);
    }
    
    // Check roles directly
    const { data: roles, error: rolesError } = await supabase
      .from('sd_user_roles')
      .select('*')
      .eq('user_id', user.id);
      
    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
    } else {
      console.log('User roles:', roles);
    }
  }
}

// Check if a specific user ID was provided
const userId = process.argv[2];
if (userId) {
  // Test specific user
  isAdmin(userId).then(result => {
    console.log(`\nAdmin check result for ${userId}: ${result}`);
    process.exit(0);
  });
} else {
  // Test all users
  testAllUsers().then(() => {
    console.log('\nAdmin status check complete');
    process.exit(0);
  });
}