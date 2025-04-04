'use client';

import React, { useCallback } from 'react';
import Link from 'next/link';
import type { SidebarChatItem } from '@/hooks/chat/useChatHistoryData';
import { cn } from '@/lib/utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import {
    SidebarMenuItem,
    SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    MoreHorizontalIcon,
    TrashIcon,
    PencilEditIcon,
} from '@/components/icons'; // Assuming icons are centralized

interface ChatHistoryItemProps {
    chat: SidebarChatItem;
    isActive: boolean;
    onRename: (chatId: string, currentTitle: string) => void;
    onDelete: (chatId: string) => void;
    isRenaming?: boolean; // Optional: To disable rename during action
    isDeleting?: boolean; // Optional: To disable delete during action
    // Prop to handle closing mobile sidebar on navigation, passed from parent
    setOpenMobile?: (open: boolean) => void;
}

export const ChatHistoryItem = React.memo<ChatHistoryItemProps>(({
    chat,
    isActive,
    onRename,
    onDelete,
    isRenaming = false,
    isDeleting = false,
    setOpenMobile
}) => {

    // Handle navigation click - logs and closes mobile sidebar if applicable
    const handleLinkClick = useCallback((e: React.MouseEvent) => {
        edgeLogger.debug('[ChatHistoryItem] Link clicked', {
            category: LOG_CATEGORIES.CHAT,
            chatId: chat.id,
            href: `/chat/${chat.id}`
        });
        // Close mobile sidebar on click if function is provided
        if (setOpenMobile) {
            setOpenMobile(false);
        }
        // DO NOT call e.preventDefault() - let the Link component handle navigation
    }, [chat.id, setOpenMobile]);

    // Prevent dropdown trigger from navigating
    const handleDropdownTriggerClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent click from bubbling to the Link
    }, []);

    // Handle rename menu item click
    const handleRenameMenuItemClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); // Prevent any default behavior
        e.stopPropagation(); // Stop propagation
        edgeLogger.debug('[ChatHistoryItem] Rename menu item clicked', {
            category: LOG_CATEGORIES.CHAT,
            chatId: chat.id
        });
        onRename(chat.id, chat.title || '');
    }, [chat.id, chat.title, onRename]);

    // Handle delete menu item click
    const handleDeleteMenuItemClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); // Prevent any default behavior
        e.stopPropagation(); // Stop propagation
        edgeLogger.debug('[ChatHistoryItem] Delete menu item clicked', {
            category: LOG_CATEGORIES.CHAT,
            chatId: chat.id
        });
        onDelete(chat.id);
    }, [chat.id, onDelete]);

    return (
        <SidebarMenuItem className="px-1 py-0.5 group/menu-item">
            {/* Remove legacyBehavior, move onClick to child */}
            <Link
                href={`/chat/${chat.id}`}
                passHref
            // legacyBehavior removed
            >
                <SidebarMenuButton
                    onClick={handleLinkClick} // onClick moved here
                    isActive={isActive}
                    className={cn(
                        "flex items-center group rounded-md px-3 py-2 hover:bg-sidebar-item-hover transition-colors w-full",
                        isActive && "bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                    )}
                    role="button"
                    tabIndex={0} // Ensure it's keyboard focusable
                >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="truncate text-base">{chat.title || "New Chat"}</span>
                    </div>
                </SidebarMenuButton>
            </Link>

            {/* Dropdown Menu - positioned absolutely relative to SidebarMenuItem */}
            <div className="opacity-0 group-hover/menu-item:opacity-100 transition-opacity absolute right-2 top-1/2 -translate-y-1/2 z-10"> {/* Adjust positioning */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={handleDropdownTriggerClick}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                            aria-label={`Actions for ${chat.title || "New Chat"}`}
                        >
                            <MoreHorizontalIcon size={16} />
                            <span className="sr-only">Chat Actions</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={5}>
                        <DropdownMenuItem
                            onClick={handleRenameMenuItemClick}
                            disabled={isRenaming || isDeleting}
                        >
                            <PencilEditIcon size={16} />
                            <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleDeleteMenuItemClick}
                            className="text-red-500 hover:!text-red-600 focus:!text-red-500"
                            disabled={isDeleting || isRenaming} // Disable if renaming too?
                        >
                            <TrashIcon size={16} />
                            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </SidebarMenuItem>
    );
});

ChatHistoryItem.displayName = 'ChatHistoryItem'; 