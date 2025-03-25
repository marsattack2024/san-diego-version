import { createClient } from '@/utils/supabase/server';
import { UserProfile } from './schema';

/**
 * Gets suggestions for a document
 * @param param0 The document ID
 * @returns An array of suggestions
 */
export async function getSuggestionsByDocumentId({ documentId }: { documentId: string }) {
  // For MVP, we're returning an empty array
  // This would typically connect to a database to get suggestions
  return [];
}

/**
 * Gets the user profile
 * @param userId The user ID
 * @returns The user profile or null if not found
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('sd_user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  
  return data as UserProfile;
}

/**
 * Creates or updates the user profile
 * @param profile The user profile data
 * @returns The updated user profile or null on error
 */
export async function upsertUserProfile(profile: Partial<UserProfile> & { user_id: string }): Promise<UserProfile | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('sd_user_profiles')
    .upsert(profile)
    .select()
    .single();
  
  if (error) {
    console.error('Error upserting user profile:', error);
    return null;
  }
  
  return data as UserProfile;
} 