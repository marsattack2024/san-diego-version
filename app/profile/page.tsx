import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile-form';
import { createServerClient } from '@/lib/supabase/server';

export default async function ProfilePage() {
  // Get server-side Supabase client
  const supabase = await createServerClient();
  
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  
  // Redirect to login if not authenticated
  if (!user) {
    redirect('/auth/login');
  }
  
  // Pre-fetch profile data server-side
  const { data: profile } = await supabase
    .from('sd_user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  // Check if this is first login or has existing profile
  const isFirstLogin = !profile;
  
  return <ProfileForm 
    initialProfile={profile || {}} 
    userId={user.id}
    isFirstLogin={isFirstLogin}
  />;
}