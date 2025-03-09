'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

import { PlusIcon } from '@/components/icons';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav, type User } from '@/components/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function AppSidebar({ user: serverUser }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [user, setUser] = useState<User | undefined>(serverUser);
  
  // If no user was provided from the server, try to get it on the client side
  useEffect(() => {
    async function getUser() {
      if (serverUser) {
        // If we already have user from server, use that
        return;
      }
      
      try {
        console.log("Attempting to get user from client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        
        if (data.user) {
          console.log("Client-side auth detected user:", data.user.id);
          setUser(data.user);
        } else {
          console.log("No user found from client-side auth");
        }
      } catch (error) {
        console.error("Error getting user on client:", error);
      }
    }
    
    getUser();
  }, [serverUser]);

  return (
    <Sidebar 
      className="group-data-[side=left]:border-r-0"
      collapsible="offcanvas" // Change to offcanvas mode to fully close
    >
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <Link
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
              className="flex flex-row gap-3 items-center"
            >
              <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer">
                Chatbot
              </span>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="p-2 h-fit"
                  onClick={() => {
                    setOpenMobile(false);
                    // Force a new chat to be created with a unique timestamp to prevent caching
                    const timestamp = Date.now();
                    // Using replace instead of push for a hard navigation
                    window.location.href = `/chat?new=true&t=${timestamp}`;
                  }}
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarHistory user={user} />
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
