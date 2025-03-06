import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { createServerClient } from '@/lib/supabase/server';

export default async function LoginPage() {
  const supabase = await createServerClient();
  
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
          Sign in to your account
        </h2>
        <LoginForm />
      </div>
    </div>
  );
}