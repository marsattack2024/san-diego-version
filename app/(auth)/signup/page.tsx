import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth';
import { createClient } from '@/utils/supabase/server';

// Mark this route as dynamic since it uses cookies
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  try {
    const supabase = await createClient();
    
    // Check if user is already logged in
    const { data: { user } } = await supabase.auth.getUser();
    
    // If logged in, redirect to the chat page
    if (user) {
      redirect('/chat');
    }
    
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">
          <h2 className="mb-6 text-center text-3xl font-bold tracking-tight">
            Create your account
          </h2>
          <SignupForm />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error in signup page:', error);
    
    // Return the signup page anyway instead of crashing
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">
          <h2 className="mb-6 text-center text-3xl font-bold tracking-tight">
            Create your account
          </h2>
          <SignupForm />
        </div>
      </div>
    );
  }
} 