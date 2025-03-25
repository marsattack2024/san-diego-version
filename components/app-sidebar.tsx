'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { historyService } from '@/lib/api/history-service';
import { type User } from '@supabase/supabase-js';

import { PlusIcon } from '@/components/icons';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
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
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  
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
                  onClick={async () => {
                    // Prevent multiple clicks
                    if (isCreatingChat) return;
                    
                    setIsCreatingChat(true);
                    setOpenMobile(false);
                    
                    try {
                      // Create a new session in the database first
                      const { id, success, error } = await historyService.createNewSession();
                      
                      if (success) {
                        // Navigate to the new chat directly
                        router.push(`/chat/${id}`);
                      } else {
                        console.error('Failed to create new chat session:', error);
                        // Fallback to old method if creation fails
                        const timestamp = Date.now();
                        window.location.href = `/chat?new=true&t=${timestamp}`;
                      }
                    } catch (error) {
                      console.error('Error creating new chat:', error);
                      // Fallback to old method
                      const timestamp = Date.now();
                      window.location.href = `/chat?new=true&t=${timestamp}`;
                    } finally {
                      // Reset creating state after a short delay
                      setTimeout(() => setIsCreatingChat(false), 500);
                    }
                  }}
                  disabled={isCreatingChat}
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
