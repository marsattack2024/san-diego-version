'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import { SidebarToggle } from './sidebar-toggle';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { PlusIcon, MagnifyingGlassIcon } from './icons';
import { useChatStore } from '@/stores/chat-store';

export function PureChatHeader({
  chatId,
  isReadonly,
}: {
  chatId: string;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());

  const handleNewChat = () => {
    router.push('/chat');
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        {isMobile && <SidebarToggle />}
        {deepSearchEnabled && (
          <div className="flex items-center text-xs text-muted-foreground">
            <MagnifyingGlassIcon size={12} className="mr-1" />
            <span className="flex items-center">DeepSearch enabled</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="New Chat"
              onClick={handleNewChat}
            >
              <PlusIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

export const ChatHeader = PureChatHeader;
