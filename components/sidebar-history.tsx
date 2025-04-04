'use client';

import React, { Suspense, useState } from 'react';
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
    // Use original handlers from hook
    handleDeleteCancel: originalHandleDeleteCancel,
    handleDeleteConfirm: originalHandleDeleteConfirm,
    isDeleting: isDeletingMap, // Renamed to avoid conflict
    deleteId,
    // Rename state/handlers for Rename Dialog
    showRenameDialog,
    renameTitle,
    handleRenameCancel: originalHandleRenameCancel,
    handleRenameConfirm: originalHandleRenameConfirm,
    isRenaming: isRenamingMap, // Renamed to avoid conflict
    renameId,
    handleRenameTitleChange,
    // Get the setter for debugging
    _setActionState_DEBUG
  } = useChatActions();

  // Dummy state for forcing updates
  const [, forceUpdate] = useState(0);

  // Create wrapper functions that force update
  const handleDeleteCancel = () => {
    originalHandleDeleteCancel();
    forceUpdate(c => c + 1);
  };
  const handleDeleteConfirm = async () => {
    await originalHandleDeleteConfirm();
    forceUpdate(c => c + 1);
  };
  const handleRenameCancel = () => {
    originalHandleRenameCancel();
    forceUpdate(c => c + 1);
  };
  const handleRenameConfirm = async () => {
    await originalHandleRenameConfirm();
    forceUpdate(c => c + 1);
  };
  const handleRenameTitleChange_Forced = (value: string) => {
    handleRenameTitleChange(value);
    // Optionally force update on title change too if needed for debugging
    // forceUpdate(c => c + 1);
  };

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

      {/* Dialogs use the NEW wrapper handlers */}
      <DeleteChatDialog
        open={showDeleteDialog}
        // Pass wrapper handler for onOpenChange
        onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}
        onConfirm={handleDeleteConfirm} // Pass wrapper handler
        onCancel={handleDeleteCancel} // Pass wrapper handler
        isDeleting={isCurrentlyDeleting}
      />

      <RenameChatDialog
        open={showRenameDialog}
        // Pass wrapper handler for onOpenChange
        onOpenChange={(open) => { if (!open) handleRenameCancel(); }}
        onConfirm={handleRenameConfirm} // Pass wrapper handler
        onCancel={handleRenameCancel} // Pass wrapper handler
        isRenaming={isCurrentlyRenaming}
        value={renameTitle}
        // Pass the original handler OR a forced wrapper if needed
        onValueChange={handleRenameTitleChange}
      />
    </>
  );
};

// Export the main refactored component
export const SidebarHistory = SidebarHistoryContent;
export default SidebarHistory;
