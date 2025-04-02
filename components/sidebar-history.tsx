'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Chat } from '@/lib/db/schema';
import { historyService } from '@/lib/api/history-service';
import { toast } from 'sonner';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  PlusCircle,
  RefreshCw
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import {
  MoreHorizontalIcon,
  TrashIcon,
  PencilEditIcon,
} from '@/components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { throttle } from 'lodash';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { useChatStore, type Conversation } from '@/stores/chat-store';
import { shallow } from 'zustand/shallow';

// Consistent type definition for grouped chats
type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  pastWeek: Chat[];
  older: Chat[];
};

// Simplified and standardized groupChatsByDate function
const groupChatsByDate = (chats: Array<Chat>): GroupedChats => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeekDate = new Date(today);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);

  return {
    today: chats.filter((chat) => {
      const chatDate = new Date(chat.updatedAt || chat.createdAt);
      return chatDate >= today;
    }),
    yesterday: chats.filter((chat) => {
      const chatDate = new Date(chat.updatedAt || chat.createdAt);
      const chatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());
      return chatDay.getTime() === yesterday.getTime();
    }),
    pastWeek: chats.filter((chat) => {
      const chatDate = new Date(chat.updatedAt || chat.createdAt);
      return chatDate < yesterday && chatDate >= lastWeekDate;
    }),
    older: chats.filter((chat) => {
      const chatDate = new Date(chat.updatedAt || chat.createdAt);
      return chatDate < lastWeekDate;
    }),
  };
};

// Chat item component with proper typing
const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  onRename,
  setOpenMobile,
  isDeleting = false,
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onRename: (chatId: string, newTitle: string) => void;
  setOpenMobile: (open: boolean) => void;
  isDeleting?: boolean;
}) => {
  return (
    <SidebarMenuItem className="px-1 py-0.5">
      <Link href={`/chat/${chat.id}`}>
        <SidebarMenuButton
          asChild={false}
          isActive={isActive}
          className={cn(
            "flex items-center group rounded-md px-3 py-2 hover:bg-sidebar-item-hover transition-colors w-full",
            isActive && "bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
          )}
          onClick={() => setOpenMobile(false)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="truncate text-base">{chat.title || "New Chat"}</span>
          </div>
        </SidebarMenuButton>
      </Link>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            >
              <MoreHorizontalIcon size={16} />
              <span className="sr-only">Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onRename(chat.id, chat.title || "");
              }}
            >
              <PencilEditIcon size={16} />
              <span className="ml-2">Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onDelete(chat.id);
              }}
              className="text-red-500 hover:text-red-600 focus:text-red-500"
              disabled={isDeleting}
            >
              <TrashIcon size={16} />
              <span className="ml-2">{isDeleting ? "Deleting..." : "Delete"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  );
};

const PureSidebarHistory = ({ user }: { user: User | undefined }) => {
  const { setOpenMobile, openMobile } = useSidebar();
  const params = useParams();
  const id = params?.id as string;
  const pathname = usePathname();
  const router = useRouter();

  // Use Zustand store selectors
  const conversations = useChatStore(state => state.conversations);
  const fetchHistory = useChatStore(state => state.fetchHistory);
  const isLoadingHistory = useChatStore(state => state.isLoadingHistory);
  const historyError = useChatStore(state => state.historyError);
  const deleteConversation = useChatStore(state => state.deleteConversation);

  // Convert conversations map to Chat array for display
  const historyArray = useMemo(() => {
    return Object.values(conversations).map(conv => ({
      id: conv.id,
      title: conv.title || '',
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt || conv.createdAt, // Ensure updatedAt has a fallback
      userId: conv.userId || '',
      messages: [] // We don't need the messages for display
    } as Chat));
  }, [conversations]);

  // Local UI state
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAllOlder, setShowAllOlder] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<Record<string, boolean>>({});
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  // Helper functions
  const detectMobile = useCallback(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }, []);

  // Check if page is visible
  const isPageVisible = useCallback(() => {
    return typeof document !== 'undefined' && document.visibilityState === 'visible';
  }, []);

  // Update mobile state on resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(detectMobile());
    };

    if (typeof window !== 'undefined') {
      // Set initial value
      setIsMobile(detectMobile());

      // Add listener
      window.addEventListener('resize', handleResize);

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [detectMobile]);

  // ** Restore Original Initial Fetch Logic **
  useEffect(() => {
    if (!user?.id) return;
    console.debug('[SidebarHistory] Initial history fetch on component mount (Restored Logic)');
    fetchHistory(false); // Fetch without forcing refresh on initial mount
  }, [fetchHistory, user?.id]);

  // ** Restore Polling Logic (Optional but part of working version) **
  useEffect(() => {
    if (!user?.id) return;

    const pollingInterval = isMobile ? 15 * 60 * 1000 : 8 * 60 * 1000;
    const jitter = Math.floor(Math.random() * 45000);
    const effectiveInterval = pollingInterval + jitter;

    console.debug(`[SidebarHistory] Setting up history polling every ${Math.round(effectiveInterval / 1000)}s (Restored Logic)`);
    const intervalId = setInterval(() => {
      if (isPageVisible() && user?.id) {
        console.debug('[SidebarHistory] Polling: fetching history (Restored Logic)');
        fetchHistory(false);
      }
    }, effectiveInterval);

    return () => clearInterval(intervalId);
  }, [fetchHistory, isMobile, isPageVisible, user?.id]);

  // Set error message when store has errors
  useEffect(() => {
    if (historyError) {
      setErrorMessage(`Error loading chats: ${historyError}`);
    } else {
      setErrorMessage(null);
    }
  }, [historyError]);

  // Manual refresh function
  const refreshHistory = useCallback(() => {
    console.debug('[SidebarHistory] Manual refresh requested');
    fetchHistory(true); // Force refresh
  }, [fetchHistory]);

  // Handle delete button click
  const handleDeleteClick = useCallback((chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  }, []);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteId) return;

    setIsDeleting(prev => ({ ...prev, [deleteId]: true }));

    try {
      // Delete conversation using Zustand store action
      deleteConversation(deleteId);
      toast.success('Chat deleted successfully');
    } catch (error) {
      console.error('Failed to delete chat:', error);
      toast.error('Failed to delete chat');
      setIsDeleting(prev => ({ ...prev, [deleteId]: false }));
    } finally {
      setShowDeleteDialog(false);
      setDeleteId(null);
    }
  }, [deleteId, deleteConversation]);

  // Handle rename button click  
  const handleRenameClick = useCallback((chatId: string, currentTitle: string) => {
    setRenameId(chatId);
    setRenameTitle(currentTitle);
    setShowRenameDialog(true);
  }, []);

  // Handle rename confirmation
  const handleRenameConfirm = useCallback(async () => {
    if (!renameId || !renameTitle.trim()) return;

    setIsRenaming(prev => ({ ...prev, [renameId]: true }));

    try {
      const supabase = await createClient();

      // Update title in database
      const { error } = await supabase
        .from('sd_chat_sessions')
        .update({ title: renameTitle.trim() })
        .eq('id', renameId);

      if (error) throw error;

      // Update conversation title in Zustand store
      useChatStore.getState().updateConversationTitle(renameId, renameTitle.trim());

      toast.success('Chat renamed successfully');
    } catch (error) {
      console.error('Failed to rename chat:', error);
      toast.error('Failed to rename chat');
    } finally {
      setIsRenaming(prev => ({ ...prev, [renameId]: false }));
      setShowRenameDialog(false);
      setRenameId(null);
      setRenameTitle('');
    }
  }, [renameId, renameTitle]);

  // Group chats by date
  const groupedChats = useMemo(() => {
    return groupChatsByDate(historyArray);
  }, [historyArray]);

  // Render chat sections - simple divs, no overflow control here
  const renderChats = useCallback((chats: Array<Chat>) => {
    if (chats.length === 0) {
      return null;
    }

    const groupedChats = groupChatsByDate(chats);

    return (
      <>
        {/* Today's chats */}
        {groupedChats.today.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-1 text-xs text-sidebar-foreground/60 px-4">Today</h3>
            <div className="space-y-1">
              {groupedChats.today.map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteClick}
                  onRename={handleRenameClick}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Yesterday's chats */}
        {groupedChats.yesterday.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-1 text-xs text-sidebar-foreground/60 px-4">Yesterday</h3>
            <div className="space-y-1">
              {groupedChats.yesterday.map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteClick}
                  onRename={handleRenameClick}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past week's chats */}
        {groupedChats.pastWeek.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-1 text-xs text-sidebar-foreground/60 px-4">Past Week</h3>
            <div className="space-y-1">
              {groupedChats.pastWeek.map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteClick}
                  onRename={handleRenameClick}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Older chats (with toggle) */}
        {groupedChats.older.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-1 text-xs text-sidebar-foreground/60 px-4 flex justify-between items-center">
              <span>Older</span>
              {groupedChats.older.length > 5 && (
                <button
                  onClick={() => setShowAllOlder(!showAllOlder)}
                  className="text-xs font-medium text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {showAllOlder ? "Show Less" : `Show All (${groupedChats.older.length})`}
                </button>
              )}
            </h3>
            <div className="space-y-1">
              {(showAllOlder ? groupedChats.older : groupedChats.older.slice(0, 5)).map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteClick}
                  onRename={handleRenameClick}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}
      </>
    );
    // Restore original dependencies
  }, [groupChatsByDate, handleDeleteClick, handleRenameClick, id, isDeleting, setOpenMobile, showAllOlder]);

  // Compute empty state
  const isEmpty = useMemo(() => {
    return historyArray.length === 0 && !isLoadingHistory;
  }, [historyArray.length, isLoadingHistory]);

  // Simplified render - return a Fragment containing the header and the menu
  return (
    <>
      {/* Header section with refresh button */}
      <div className="flex items-center justify-end h-8 px-2 pt-2">
        <div className="flex items-center gap-1">
          {historyError ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-1">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-60 text-sm">
                  {historyError}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : null}
          <SidebarMenuAction
            onClick={refreshHistory}
            className="ml-auto" // Position to the right
            disabled={isLoadingHistory}
            title="Refresh chat history"
          >
            {isLoadingHistory ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </SidebarMenuAction>
        </div>
      </div>

      {/* Chat history list rendered directly */}
      <SidebarMenu className="px-2 pb-20"> {/* Add padding here */}
        {isLoadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
            <p className="text-base">No chat history found</p>
            <p className="text-sm mt-1">Start a new conversation to get started</p>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-destructive px-4">
            <p className="text-base">{errorMessage}</p>
            <button
              className="text-sm mt-2 px-4 py-2 bg-muted rounded-md hover:bg-muted/80 transition-colors"
              onClick={() => fetchHistory(true)}
            >
              Try Again
            </button>
          </div>
        ) : historyArray.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
            <p className="text-base">No chat history found</p>
            <p className="text-sm mt-1">Start a new conversation to get started</p>
          </div>
        ) : (
          renderChats(historyArray)
        )}
      </SidebarMenu>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Enter a new title"
              className="w-full"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRenameDialog(false);
                setRenameTitle('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameConfirm} disabled={!renameTitle.trim()}>
              {isRenaming[renameId ?? ''] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Export memoized version for better performance
export const SidebarHistory = React.memo(PureSidebarHistory);
export default SidebarHistory;
