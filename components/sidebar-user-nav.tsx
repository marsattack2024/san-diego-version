'use client';
import { ChevronUp, User as UserIcon, Camera, Pencil } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { createBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/db/schema';

// Define a User type that matches what we get from Supabase
export interface User {
  id: string;
  email?: string;
  aud?: string;
  app_metadata?: any;
  user_metadata?: any;
}

export function SidebarUserNav({ user }: { user: User }) {
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const supabase = createBrowserClient();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  useEffect(() => {
    async function fetchUserProfile() {
      if (user?.id) {
        const { data, error } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
          
        if (data && !error) {
          setUserProfile(data as UserProfile);
        }
      }
    }
    
    fetchUserProfile();
  }, [user, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent bg-background data-[state=open]:text-sidebar-accent-foreground h-10">
              <div className="relative">
                <Image
                  src={`https://avatar.vercel.sh/${user.email || user.id}`}
                  alt={user.email || user.id || 'User Avatar'}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
                {userProfile && (
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                )}
              </div>
              <span className="truncate">
                {userProfile?.company_name || user?.email || `User ${user.id.substring(0,8)}`}
              </span>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="w-[--radix-popper-anchor-width]"
          >
            {userProfile && (
              <>
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium">{userProfile.company_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{userProfile.location || 'No location set'}</div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => router.push('/profile')}
            >
              {userProfile ? (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit profile
                </>
              ) : (
                <>
                  <UserIcon className="mr-2 h-4 w-4" />
                  Setup profile
                </>
              )}
            </DropdownMenuItem>
            
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {`Toggle ${theme === 'light' ? 'dark' : 'light'} mode`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <button
                type="button"
                className="w-full cursor-pointer"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
