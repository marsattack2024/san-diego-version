'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import { SidebarToggle } from './sidebar-toggle';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MagnifyingGlassIcon, PlusIcon } from './icons';
import { useChatStore } from '@/stores/chat-store';
import { AuthButton } from './auth/auth-button';
import { useState } from 'react';
import { historyService } from '@/lib/api/history-service';
import { CircuitBreakerDebug } from './debug/circuit-breaker-debug';
import { createClient } from '@/utils/supabase/client';

export function PureChatHeader({
  chatId,
  isReadonly,
  title,
  isLoading,
}: {
  chatId?: string;
  isReadonly?: boolean;
  title?: string;
  isLoading?: boolean;
}) {
  const router = useRouter();
  const params = useParams();
  const urlChatId = params?.id as string;
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Use URL param ID if no chatId is explicitly provided (for use in layout)
  const effectiveChatId = chatId || urlChatId || '';

  const handleNewChat = async () => {
    // Prevent multiple clicks
    if (isCreatingChat) return;

    setIsCreatingChat(true);

    try {
      // Get supabase client
      const supabase = createClient();

      // Create a new session in the database first
      const { id, success, error } = await historyService.createNewSession(supabase);

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
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b bg-background px-4 shadow-lg" style={{ height: 'var(--header-height)' }}>
      <div className="flex items-center">
        <Link href="/chat" className="font-semibold text-xl hover:text-primary transition-colors mr-4">
          Marlan
        </Link>
        <SidebarToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={handleNewChat}
              className="md:px-2 h-10 ml-2"
              disabled={isCreatingChat}
            >
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2">
        <AuthButton />
        <CircuitBreakerDebug inline={true} />
      </div>
    </header>
  );
}

export const ChatHeader = PureChatHeader;
