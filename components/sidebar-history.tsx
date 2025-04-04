'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
// Restore imports
import { SidebarMenu } from '@/components/ui/sidebar';
import { useChatHistoryData } from '@/hooks/chat/useChatHistoryData';
import { ChatHistoryList } from './sidebar/history/ChatHistoryList';
import { ChatHistoryErrorBoundary } from './sidebar/history/ErrorBoundary';
import { SidebarMenuSkeleton } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useChatActions } from '@/hooks/chat/useChatActions';
import { DeleteChatDialog } from './sidebar/history/DeleteChatDialog';
import { RenameChatDialog } from './sidebar/history/RenameChatDialog';
import { PlusCircle, RefreshCw } from 'lucide-react';
import { useCreateChat } from '@/hooks/chat/useCreateChat';
import type { ConversationMetadata } from '@/stores/chat-store';

const HistoryLoadingSkeleton = () => (
  <div className="px-2 space-y-4 py-4" data-testid="history-suspense-skeleton">
    <SidebarMenuSkeleton showIcon={false} />
    <SidebarMenuSkeleton showIcon={false} />
    <SidebarMenuSkeleton showIcon={false} />
  </div>
);

const SidebarHistoryContent = () => {
  const { refreshHistory, conversationsIndex } = useChatHistoryData();
  const { createNewChat } = useCreateChat();
  const {
    showDeleteDialog,
    handleDeleteCancel,
    handleDeleteConfirm,
    isDeleting: isDeletingMap,
    deleteId,
    showRenameDialog,
    renameTitle,
    handleRenameCancel,
    handleRenameConfirm,
    isRenaming: isRenamingMap,
    renameId,
    handleRenameTitleChange,
    handleDeleteClick,
    handleRenameClick
  } = useChatActions();

  const params = useParams();
  const router = useRouter();
  const activeChatId = params?.id as string | undefined;

  useEffect(() => {
    if (activeChatId) {
      const isActiveChatDeleted = !conversationsIndex[activeChatId];

      if (isActiveChatDeleted) {
        console.log(`[SidebarHistory] Active chat ${activeChatId} deleted. Finding next chat...`);
        const remainingChats = Object.values(conversationsIndex) as ConversationMetadata[];

        if (remainingChats.length > 0) {
          remainingChats.sort((a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
          );
          const nextChatId = remainingChats[0].id;
          console.log(`[SidebarHistory] Navigating to next chat: ${nextChatId}`);
          router.push(`/chat/${nextChatId}`);
        } else {
          console.log(`[SidebarHistory] No chats remaining, navigating to /chat`);
          router.push('/chat');
        }
      }
    }
  }, [conversationsIndex, activeChatId, router]);

  const isCurrentlyDeleting = deleteId ? !!isDeletingMap[deleteId] : false;
  const isCurrentlyRenaming = renameId ? !!isRenamingMap[renameId] : false;

  return (
    <>
      <div className="flex flex-col gap-2 mb-4 px-2">
        <div className="flex items-center justify-between px-2">
          <span className="font-semibold text-lg">Chats</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={createNewChat} aria-label="New Chat"><PlusCircle size={18} /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refreshHistory} aria-label="Refresh History"><RefreshCw size={18} /></Button>
          </div>
        </div>
      </div>

      <SidebarMenu className="px-2 pb-20 flex-1 overflow-y-auto">
        <ChatHistoryErrorBoundary>
          <Suspense fallback={<HistoryLoadingSkeleton />}>
            <ChatHistoryList
              onRenameClick={handleRenameClick}
              onDeleteClick={handleDeleteClick}
              renamingStates={isRenamingMap}
              deletingStates={isDeletingMap}
            />
          </Suspense>
        </ChatHistoryErrorBoundary>
      </SidebarMenu>

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
        value={renameTitle}
        onValueChange={handleRenameTitleChange}
      />
    </>
  );
};

export const SidebarHistory = SidebarHistoryContent;
export default SidebarHistory;
