import React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { ChatHeader } from '@/components/chat-header';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { AuthStatusCheck } from '@/components/auth-status-check';

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

    // Check for admin cookie
    const isAdmin = cookieStore.get('x-is-admin')?.value === 'true';

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
        isAdmin: isAdmin,
        level: 'debug'
      });
    } else {
      edgeLogger.debug("No authenticated user found in chat layout", {
        category: 'auth',
        level: 'debug'
      });
    }
  } catch (error) {
    edgeLogger.error('Failed to get user in chat layout', {
      category: 'auth',
      error: error instanceof Error ? error : String(error),
      important: true,
      level: 'error'
    });
    user = undefined;
  }

  return (
    <SidebarProvider defaultOpen={true} className="h-full">
      {/* <AppSidebar user={user || undefined} /> */}
      {/* <ChatHeader chatId="" isReadonly={false} /> */}
      <SidebarInset className="fixed-header-offset flex-1">
        {children}
      </SidebarInset>
      <AuthStatusCheck />
    </SidebarProvider>

    // ** OLD TEMPORARY: Render children directly without sidebar **
    // <div className="flex flex-col h-full">
    //   {/* Minimal header might be needed */} 
    //   {/* <ChatHeader chatId="" isReadonly={false} /> */} 
    //   <main className="flex-1 overflow-hidden">
    //     {children}
    //   </main>
    //   {/* Keep AuthStatusCheck for debugging */} 
    //   <AuthStatusCheck />
    // </div>
  );
}

