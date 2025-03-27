'use client';

// Using the newer @supabase/ssr package instead of auth-helpers
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button'; // Assuming this exists

export function SignOutButton() {
  const router = useRouter();

  // Implement signOut with the new ssr package
  const signOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  return (
    <Button variant="ghost" onClick={signOut}>
      Sign out
    </Button>
  );
}
