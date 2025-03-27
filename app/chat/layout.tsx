import React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { ChatHeader } from '@/components/chat-header';

// Force dynamic rendering since this layout uses cookies
export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get the current user from Supabase auth
  let user;
  try {
    // Get a list of cookies for debugging
    const cookieStore = await cookies();
    const cookieList = cookieStore.getAll();
    console.log("Auth Cookies:", cookieList.map(c => c.name)); // Debug log, only log names

    // Create Supabase server client with cookies
    const supabase = await createClient();

    // Get user from session
    const { data } = await supabase.auth.getUser();
    user = data.user;

    // Debug log (protect PII by only showing ID)
    if (user) {
      console.log("Chat layout retrieved user:", {
        id: user.id,
        hasEmail: !!user.email,
        roles: user.app_metadata?.roles || 'none'
      });
    } else {
      console.log("No authenticated user found in chat layout");
    }
  } catch (error) {
    console.error('Failed to get user in chat layout:', error);
    user = undefined;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar user={user || undefined} />
      <ChatHeader chatId="" isReadonly={false} />
      <SidebarInset className="pt-14">{children}</SidebarInset>
    </SidebarProvider>
  );
}

