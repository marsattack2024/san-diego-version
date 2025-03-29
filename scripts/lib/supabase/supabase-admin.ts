/**
 * Supabase Admin Utilities
 * Shared utilities for Supabase administrative operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env-loader';

// Type definitions
export type UserRole = 'admin' | 'moderator' | 'user';

export interface UserData {
  id: string;
  email: string;
  role?: UserRole;
  created_at?: string;
  last_sign_in_at?: string;
}

/**
 * Create authenticated Supabase client with admin privileges
 * @returns SupabaseClient with admin privileges
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and key are required for admin operations');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Get all users with admin role
 * @param client Supabase client instance
 * @returns Array of user data for admin users
 */
export async function getAdminUsers(client?: SupabaseClient): Promise<UserData[]> {
  const supabase = client || createAdminClient();
  
  // Query the user roles table for admin users
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .eq('role', 'admin');
  
  if (error) {
    throw new Error(`Failed to fetch admin users: ${error.message}`);
  }
  
  if (!data || data.length === 0) {
    return [];
  }
  
  // Get the full user information for each admin
  const adminUserIds = data.map(record => record.user_id);
  const users: UserData[] = [];
  
  // Process users in batches (Supabase admin API limit)
  const batchSize = 10;
  for (let i = 0; i < adminUserIds.length; i += batchSize) {
    const batch = adminUserIds.slice(i, i + batchSize);
    const promises = batch.map(async (userId) => {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      
      if (userError) {
        console.warn(`Failed to fetch user ${userId}: ${userError.message}`);
        return null;
      }
      
      if (userData?.user) {
        return {
          id: userData.user.id,
          email: userData.user.email || 'unknown',
          role: 'admin',
          created_at: userData.user.created_at,
          last_sign_in_at: userData.user.last_sign_in_at
        };
      }
      
      return null;
    });
    
    const batchResults = await Promise.all(promises);
    users.push(...batchResults.filter(Boolean) as UserData[]);
  }
  
  return users;
}

/**
 * Set user role in the database
 * @param userId User ID to update
 * @param role Role to assign to the user
 * @param client Optional Supabase client instance
 * @returns Success status
 */
export async function setUserRole(
  userId: string, 
  role: UserRole, 
  client?: SupabaseClient
): Promise<{ success: boolean; message: string }> {
  const supabase = client || createAdminClient();
  
  // Check if user exists
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  
  if (userError || !userData?.user) {
    return { 
      success: false, 
      message: `User not found: ${userError?.message || 'Unknown error'}` 
    };
  }
  
  // Check if user already has a role entry
  const { data: existingRole, error: roleError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (roleError && roleError.code !== 'PGRST116') { // PGRST116 is "not found" which is fine
    return { 
      success: false, 
      message: `Error checking existing role: ${roleError.message}` 
    };
  }
  
  let result;
  
  // Update or insert role
  if (existingRole) {
    // Update existing role
    result = await supabase
      .from('user_roles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } else {
    // Insert new role
    result = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
  }
  
  if (result.error) {
    return { 
      success: false, 
      message: `Failed to set user role: ${result.error.message}` 
    };
  }
  
  return { 
    success: true, 
    message: `User ${userData.user.email} successfully assigned role: ${role}` 
  };
}

/**
 * Find user by email
 * @param email Email to search for
 * @param client Optional Supabase client instance
 * @returns User data if found
 */
export async function findUserByEmail(
  email: string,
  client?: SupabaseClient
): Promise<UserData | null> {
  const supabase = client || createAdminClient();
  
  // Search for the user by email
  const { data, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    throw new Error(`Failed to search for user: ${error.message}`);
  }
  
  // Find the user with the matching email
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    return null;
  }
  
  // Get the user's role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  
  return {
    id: user.id,
    email: user.email || 'unknown',
    role: roleData?.role || 'user',
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at
  };
} 