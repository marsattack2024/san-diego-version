'use client';

import React from 'react';
// Remove Chat import, use SidebarChatItem potentially defined elsewhere or inline
// import type { Chat } from '@/lib/db/schema'; 
import type { SidebarChatItem } from '@/hooks/chat/useChatHistoryData'; // Assuming SidebarChatItem is exported from the hook or moved to types
import { ChatHistoryItem } from './ChatHistoryItem'; // Import the item component

interface ChatHistorySectionProps {
    title: string;
    chats: SidebarChatItem[]; // <-- Update type here
    activeChatId?: string; // To pass down to items
    // Action callbacks to pass down
    onRename: (chatId: string, currentTitle: string) => void;
    onDelete: (chatId: string) => void;
    // State to pass down for disabling actions
    deletingStates?: Record<string, boolean>;
    renamingStates?: Record<string, boolean>;
    // Mobile sidebar control
    setOpenMobile?: (open: boolean) => void;
    // Visibility control for sections like "Older"
    showAll?: boolean;
    onShowMore?: () => void; // Callback for "Show more..."
}

export const ChatHistorySection = React.memo<ChatHistorySectionProps>(({
    title,
    chats,
    activeChatId,
    onRename,
    onDelete,
    deletingStates = {},
    renamingStates = {},
    setOpenMobile,
    showAll = true,
    onShowMore
}) => {

    // Don't render empty sections
    if (!chats || chats.length === 0) return null;

    // Determine visible chats and if "Show more" is needed
    const visibleChats = showAll ? chats : chats.slice(0, 5);
    const hiddenCount = chats.length - visibleChats.length;
    const hasMore = !showAll && hiddenCount > 0;

    return (
        <div className="mb-6 last:mb-0" data-testid={`history-section-${title.toLowerCase().replace(' ', '-')}`}>
            <h2 className="mb-2 uppercase text-sm font-medium text-sidebar-foreground/50 pl-3">
                {title}
            </h2>
            <div className="space-y-0.5">
                {visibleChats.map((chat) => (
                    <ChatHistoryItem
                        key={chat.id}
                        chat={chat}
                        isActive={chat.id === activeChatId}
                        onRename={onRename}
                        onDelete={onDelete}
                        isDeleting={deletingStates[chat.id] || false}
                        isRenaming={renamingStates[chat.id] || false}
                        setOpenMobile={setOpenMobile}
                    />
                ))}
                {hasMore && onShowMore && (
                    <div
                        className="px-3 py-2 text-sm text-muted-foreground/70 hover:text-muted-foreground cursor-pointer"
                        onClick={onShowMore}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onShowMore(); }}
                        aria-label={`Show ${hiddenCount} older chats`}
                    >
                        Show {hiddenCount} more...
                    </div>
                )}
            </div>
        </div>
    );
});

ChatHistorySection.displayName = 'ChatHistorySection'; 