'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import { SidebarToggle } from './sidebar-toggle';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MagnifyingGlassIcon } from './icons';
import { useChatStore } from '@/stores/chat-store';
import { AuthButton } from './auth/auth-button';
import { AgentSelector } from './agent-selector';

export function PureChatHeader({
  chatId,
  isReadonly,
  title,
  isLoading,
}: {
  chatId: string;
  isReadonly: boolean;
  title?: string;
  isLoading?: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <SidebarToggle />
        <AgentSelector />
        {deepSearchEnabled && (
          <div className="flex items-center text-xs text-muted-foreground">
            <MagnifyingGlassIcon size={12} className="mr-1" />
            <span className="flex items-center">DeepSearch enabled</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <AuthButton />
      </div>
    </header>
  );
}

export const ChatHeader = PureChatHeader;
