'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import ProfileForm from './profile-form';

export default function ProfileSetup() {
  const router = useRouter();
  
  useEffect(() => {
    // Show warning and redirect to the new profile page implementation
    toast.info('Redirecting to updated profile page...');
    
    // Redirect to the new profile page
    setTimeout(() => {
      router.replace('/profile');
    }, 1000);
  }, [router]);

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <div className="text-center">
        Redirecting to updated profile page...
      </div>
    </div>
  );
}