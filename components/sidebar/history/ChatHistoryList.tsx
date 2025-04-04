'use client';

import React, { useState, useMemo } from 'react';
import { useChatHistoryData } from '@/hooks/chat/useChatHistoryData';
import { useChatActions } from '@/hooks/chat/useChatActions';
import { ChatHistorySection } from './ChatHistorySection';
import { useParams } from 'next/navigation'; // To get active chat ID
import { useSidebar } from '@/components/ui/sidebar'; // To pass setOpenMobile
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarMenuSkeleton } from '@/components/ui/sidebar'; // Use existing skeleton

// Define props for ChatHistoryList
interface ChatHistoryListProps {
    onRenameClick: (chatId: string, currentTitle: string) => void;
    onDeleteClick: (chatId: string) => void;
    renamingStates: Record<string, boolean>;
    deletingStates: Record<string, boolean>;
}

export function ChatHistoryList({
    onRenameClick,
    onDeleteClick,
    renamingStates,
    deletingStates
}: ChatHistoryListProps) { // <-- Accept props
    const { groupedChats, isLoading, error, refreshHistory } = useChatHistoryData();
    const {
        isDeleting,
        isRenaming,
        handleDeleteClick,
        handleRenameClick,
        // Dialog state/handlers are not needed here, handled by parent or context
    } = useChatActions();

    const params = useParams();
    const activeChatId = params?.id as string | undefined;

    const { setOpenMobile } = useSidebar(); // Get mobile control

    const [showAllOlder, setShowAllOlder] = useState(false);

    // --- Loading State ---
    if (isLoading) {
        return (
            <div className="px-2 space-y-4 py-4" data-testid="history-loading-skeleton">
                {/* Render a few skeletons */}
                <SidebarMenuSkeleton showIcon={false} />
                <SidebarMenuSkeleton showIcon={false} />
                <SidebarMenuSkeleton showIcon={false} />
                <SidebarMenuSkeleton showIcon={false} />
            </div>
        );
    }

    // --- Error State ---
    if (error) {
        return (
            <div className="p-4 text-center text-sm text-muted-foreground" data-testid="history-error-state">
                <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                <p className="mb-3">Error loading chat history:</p>
                <p className="text-xs mb-4">{error}</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshHistory()} // Use refresh from hook
                    className="flex items-center gap-1 mx-auto"
                >
                    <RefreshCw className="h-3 w-3" /> Retry
                </Button>
            </div>
        );
    }

    // Calculate if there is any history
    const hasHistory =
        groupedChats.today.length > 0 ||
        groupedChats.yesterday.length > 0 ||
        groupedChats.pastWeek.length > 0 ||
        groupedChats.older.length > 0;

    // --- Empty State ---
    if (!hasHistory) {
        return (
            <div className="p-4 text-center text-sm text-muted-foreground" data-testid="history-empty-state">
                <p>No chat history found.</p>
                <p className="text-xs mt-1">Start a new chat to begin.</p>
            </div>
        );
    }

    // --- Render History Sections ---
    return (
        <div data-testid="history-list-sections">
            <ChatHistorySection
                title="Today"
                chats={groupedChats.today}
                activeChatId={activeChatId}
                onRename={onRenameClick} // <-- Pass down prop
                onDelete={onDeleteClick} // <-- Pass down prop
                renamingStates={renamingStates} // <-- Pass down prop
                deletingStates={deletingStates} // <-- Pass down prop
                setOpenMobile={setOpenMobile}
            />
            <ChatHistorySection
                title="Yesterday"
                chats={groupedChats.yesterday}
                activeChatId={activeChatId}
                onRename={onRenameClick} // <-- Pass down prop
                onDelete={onDeleteClick} // <-- Pass down prop
                renamingStates={renamingStates} // <-- Pass down prop
                deletingStates={deletingStates} // <-- Pass down prop
                setOpenMobile={setOpenMobile}
            />
            <ChatHistorySection
                title="Past Week"
                chats={groupedChats.pastWeek}
                activeChatId={activeChatId}
                onRename={onRenameClick} // <-- Pass down prop
                onDelete={onDeleteClick} // <-- Pass down prop
                renamingStates={renamingStates} // <-- Pass down prop
                deletingStates={deletingStates} // <-- Pass down prop
                setOpenMobile={setOpenMobile}
            />
            <ChatHistorySection
                title="Older"
                chats={groupedChats.older}
                activeChatId={activeChatId}
                onRename={onRenameClick} // <-- Pass down prop
                onDelete={onDeleteClick} // <-- Pass down prop
                renamingStates={renamingStates} // <-- Pass down prop
                deletingStates={deletingStates} // <-- Pass down prop
                setOpenMobile={setOpenMobile}
                showAll={showAllOlder}
                onShowMore={() => setShowAllOlder(true)}
            />
        </div>
    );
} 