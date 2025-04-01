'use client';
import { ChevronUp, User as UserIcon, Camera, Pencil, Shield, LogOut } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

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
import { UserProfile } from '@/lib/db/schema';
import { useAuth } from '@/utils/supabase/auth-provider';
import { useAuthStore } from '@/stores/auth-store';

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
  const { profile, isAdmin, refreshAdminStatus } = useAuth(); // Use the unified auth hook
  const logout = useAuthStore(state => state.logout);
  const [adminStatus, setAdminStatus] = useState<boolean>(isAdmin);
  const refreshAttempted = useRef(false);
  const previousAdminCookieRef = useRef<boolean | null>(null);

  // Check for admin cookie directly - but without causing an infinite loop
  useEffect(() => {
    const checkAdminCookie = () => {
      const cookies = document.cookie.split(';');
      const adminCookie = cookies.find(cookie => cookie.trim().startsWith('x-is-admin='));

      if (adminCookie) {
        const isAdminFromCookie = adminCookie.split('=')[1].trim() === 'true';

        // Only update state and log if the value changed from previous check
        if (previousAdminCookieRef.current !== isAdminFromCookie) {
          console.log('SidebarUserNav: Admin cookie found, value =', isAdminFromCookie);
          previousAdminCookieRef.current = isAdminFromCookie;
          setAdminStatus(isAdminFromCookie);
        }
      } else if (previousAdminCookieRef.current !== null) {
        console.log('SidebarUserNav: No admin cookie found');
        previousAdminCookieRef.current = null;
        setAdminStatus(false);
      }
    };

    // Check cookie immediately
    checkAdminCookie();

    // Also check on focus as the cookie may have been updated in another tab/window
    const handleFocus = () => {
      console.log('SidebarUserNav: Window focused, checking admin cookie');
      checkAdminCookie();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []); // Removed adminStatus from dependencies to avoid infinite loop

  // Aggressively refresh admin status on mount, but only once
  useEffect(() => {
    const refreshAdmin = async () => {
      if (!refreshAttempted.current) {
        refreshAttempted.current = true;
        console.log('SidebarUserNav: Initial admin status refresh attempt');

        try {
          const result = await refreshAdminStatus();
          console.log('SidebarUserNav: Admin status refresh result =', result);
          if (result !== adminStatus) {
            setAdminStatus(result);
          }
        } catch (error) {
          console.error('SidebarUserNav: Error refreshing admin status:', error);
        }
      }
    };

    refreshAdmin();
  }, [refreshAdminStatus]); // Removed adminStatus to avoid loop

  // Update local state when the isAdmin prop changes, but only if it's different
  // This prevents unnecessary re-renders
  useEffect(() => {
    if (isAdmin !== adminStatus) {
      console.log('SidebarUserNav: isAdmin prop changed to', isAdmin);
      setAdminStatus(isAdmin);
    }
  }, [isAdmin]); // Only depend on isAdmin, not adminStatus

  // Log when admin status changes, but without causing a refresh loop
  useEffect(() => {
    console.log('SidebarUserNav: Current admin status =', adminStatus);
  }, [adminStatus]);

  const handleLogout = async () => {
    try {
      // Use our new logout endpoint
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important: Include cookies
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      toast.success('Signed out successfully');

      // Redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to sign out');
    }
  };

  const handleAdminClick = () => {
    if (adminStatus) {
      console.log('SidebarUserNav: Navigating to admin panel');
      router.push('/admin');
    } else {
      console.error('SidebarUserNav: Admin access denied - not an admin');
      // Could add a toast notification here to inform the user
    }
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
                {profile && (
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                )}
              </div>
              <span className="truncate">
                {profile?.company_name || user?.email || `User ${user.id.substring(0, 8)}`}
              </span>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="w-[--radix-popper-anchor-width]"
          >
            {profile && (
              <>
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium">{profile.company_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{profile.location || 'No location set'}</div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Admin Panel Button - Only visible for admins */}
            {adminStatus && (
              <DropdownMenuItem
                className="cursor-pointer text-amber-600 hover:text-amber-700 hover:bg-amber-100"
                onClick={handleAdminClick}
              >
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => router.push('/profile')}
            >
              {profile ? (
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
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-500 hover:text-red-600 focus:text-red-500 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout & Reset Auth</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
