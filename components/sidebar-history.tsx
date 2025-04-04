'use client';

import React, { Suspense } from 'react';
import { SidebarMenu, SidebarMenuButton } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button'; // Keep for potential future use? Maybe New Chat button?
import { RefreshCw, PlusCircle } from 'lucide-react'; // Added PlusCircle
import { useChatHistoryData } from '@/hooks/chat/useChatHistoryData';
import { useChatActions } from '@/hooks/chat/useChatActions';
import { useCreateChat } from '@/hooks/chat/useCreateChat';
import { ChatHistoryList } from '@/components/sidebar/history/ChatHistoryList'; // Use alias
import { DeleteChatDialog } from '@/components/sidebar/history/DeleteChatDialog'; // Use alias
import { RenameChatDialog } from '@/components/sidebar/history/RenameChatDialog'; // Use alias
import { ChatHistoryErrorBoundary } from '@/components/sidebar/history/ErrorBoundary'; // Use alias
import { SidebarMenuSkeleton } from '@/components/ui/sidebar'; // Import Skeleton for Suspense

// Define a simple skeleton loader for suspense fallback
const HistoryLoadingSkeleton = () => (
  <div className="px-2 space-y-4 py-4" data-testid="history-suspense-skeleton">
    <SidebarMenuSkeleton showIcon={false} />
    <SidebarMenuSkeleton showIcon={false} />
    <SidebarMenuSkeleton showIcon={false} />
  </div>
);

// Main component using hooks and decomposed components
const SidebarHistoryContent = () => {
  // Use hooks to get data and actions
  const { refreshHistory } = useChatHistoryData(); // Only need refresh fn here
  const { createNewChat } = useCreateChat();
  const {
    // Delete state/handlers for Delete Dialog
    showDeleteDialog,
    handleDeleteCancel,
    handleDeleteConfirm,
    isDeleting: isDeletingMap, // Renamed to avoid conflict
    deleteId,
    // Rename state/handlers for Rename Dialog
    showRenameDialog,
    renameTitle,
    handleRenameCancel,
    handleRenameConfirm,
    isRenaming: isRenamingMap, // Renamed to avoid conflict
    renameId,
    handleRenameTitleChange,
    // Click handlers are passed down through ChatHistoryList -> Section -> Item
    // We don't need handleDeleteClick or handleRenameClick directly here
  } = useChatActions();

  // Determine single deleting/renaming state for dialogs
  const isCurrentlyDeleting = deleteId ? !!isDeletingMap[deleteId] : false;
  const isCurrentlyRenaming = renameId ? !!isRenamingMap[renameId] : false;

  return (
    <>
      <div className="flex flex-col gap-2 mb-4 px-2">
        {/* Header Buttons - Consider moving to a dedicated Header component? */}
        <div className="flex items-center justify-between px-2">
          <span className="font-semibold text-lg">Chats</span> { /* Example Title */}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={createNewChat}
              aria-label="New Chat"
            >
              <PlusCircle size={18} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refreshHistory}
              aria-label="Refresh History"
            >
              <RefreshCw size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* Chat history list section */}
      <SidebarMenu className="px-2 pb-20 flex-1 overflow-y-auto"> { /* Added flex-1 and overflow */}
        <ChatHistoryErrorBoundary>
          <Suspense fallback={<HistoryLoadingSkeleton />}>
            {/* ChatHistoryList now fetches data via its hooks */}
            <ChatHistoryList />
          </Suspense>
        </ChatHistoryErrorBoundary>
      </SidebarMenu>

      {/* Dialogs are rendered here, controlled by useChatActions state */}
      <DeleteChatDialog
        open={showDeleteDialog}
        onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={isCurrentlyDeleting}
      />

      <RenameChatDialog
        open={showRenameDialog}
        onOpenChange={(open) => { if (!open) handleRenameCancel(); }}
        onConfirm={handleRenameConfirm}
        onCancel={handleRenameCancel}
        isRenaming={isCurrentlyRenaming}
        value={renameTitle} // Pass current title value from state
        onValueChange={handleRenameTitleChange} // Pass update handler
      />
    </>
  );
};

// Export the main refactored component
export const SidebarHistory = SidebarHistoryContent;
export default SidebarHistory;
