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
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4 shadow-lg">
      <div className="flex items-center gap-2">
        <SidebarToggle />
        <Link href="/chat" className="font-semibold text-xl hover:text-primary transition-colors">
          Marlan
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <AuthButton />
      </div>
    </header>
  );
}

export const ChatHeader = PureChatHeader;
