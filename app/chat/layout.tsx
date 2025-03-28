import React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { ChatHeader } from '@/components/chat-header';
import { edgeLogger } from '@/lib/logger/edge-logger';

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
    // Get cookies for auth
    const cookieStore = await cookies();

    // Create Supabase server client with cookies
    const supabase = await createClient();

    // Get user from session
    const { data } = await supabase.auth.getUser();
    user = data.user;

    // Debug log (protect PII by only showing ID)
    if (user) {
      edgeLogger.debug("Chat layout retrieved user", {
        category: 'auth',
        userId: user.id,
        hasEmail: !!user.email,
        hasRoles: !!user.app_metadata?.roles
      });
    } else {
      edgeLogger.debug("No authenticated user found in chat layout", {
        category: 'auth'
      });
    }
  } catch (error) {
    edgeLogger.error('Failed to get user in chat layout', {
      category: 'auth',
      error: error instanceof Error ? error : String(error),
      important: true
    });
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

