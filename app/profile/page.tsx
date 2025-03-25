import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile-form';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // Get server-side Supabase client
  const supabase = await createClient();
  
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  
  // Redirect to login if not authenticated
  if (!user) {
    redirect('/auth/login');
  }
  
  // Pre-fetch profile data server-side
  let profile = null;
  try {
    const { data, error } = await supabase
      .from('sd_user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
      
    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      profile = data;
    }
  } catch (error) {
    console.error('Exception fetching profile:', error);
  }
  
  // Check if this is first login or has existing profile
  const isFirstLogin = !profile;
  
  return <ProfileForm 
    initialProfile={profile || {}} 
    userId={user.id}
    isFirstLogin={isFirstLogin}
  />;
}