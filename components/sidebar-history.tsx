'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
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
import { useChatStore, type Conversation, type ConversationMetadata } from '@/stores/chat-store';
import { shallow } from 'zustand/shallow';
import { useAuth } from '@/utils/supabase/auth-provider';
import { useAuthStore } from '@/stores/auth-store';

const log = edgeLogger; // Create a local reference for cleaner code

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
  // Add debug logging when clicked
  const handleClick = () => {
    edgeLogger.debug('[SidebarHistory] Chat item clicked', {
      id: chat.id,
      title: chat.title
    });

    // Force the router.push to use a hard navigation with replace
    const href = `/chat/${chat.id}`;
    edgeLogger.debug('[SidebarHistory] Navigating to', { href });
    window.location.href = href;
  };

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
          onClick={handleClick}
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

const PureSidebarHistory = ({ user: serverUser }: { user: User | undefined }) => {
  const { setOpenMobile, openMobile } = useSidebar();
  const params = useParams();
  const id = params?.id as string;
  const pathname = usePathname();
  const router = useRouter();

  // Get auth state from auth store instead of auth provider
  const { isLoading: authLoading, supabase } = useAuth();
  const { isAuthenticated, user, profile } = useAuthStore();

  // Use Zustand store selectors
  const conversationsIndex = useChatStore(state => state.conversationsIndex);
  const fetchHistory = useChatStore(state => state.fetchHistory);
  const isLoadingHistory = useChatStore(state => state.isLoadingHistory);
  const historyError = useChatStore(state => state.historyError);
  const deleteConversation = useChatStore(state => state.deleteConversation);

  // Convert conversationsIndex map to Chat array for display
  const historyArray = useMemo(() => {
    return Object.values(conversationsIndex).map(metadata => ({
      id: metadata.id,
      title: metadata.title || '',
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt || metadata.createdAt, // Ensure updatedAt has a fallback
      userId: metadata.userId || '',
      messages: [] // We don't need the messages for display, and metadata doesn't include them
    } as Chat));
  }, [conversationsIndex]);

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

  // Add component mounted ref
  const isComponentMounted = useRef(true);

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

  // Manual refresh handler
  const refreshHistory = useCallback(() => {
    console.debug('[SidebarHistory] Manual refresh requested');

    // Add more debug info about the refresh
    log.debug('[SidebarHistory] Current history state before refresh', {
      category: LOG_CATEGORIES.CHAT,
      indexCount: Object.keys(conversationsIndex).length,
      historyArrayLength: historyArray.length,
      isAuthenticated,
      userId: user?.id,
      isCurrentlyLoading: isLoadingHistory
    });

    return fetchHistory(true).catch(error => {
      console.error('[SidebarHistory] Error during manual refresh:', error);
      setErrorMessage('Failed to refresh history');
    });
  }, [fetchHistory, conversationsIndex, historyArray.length, isAuthenticated, user?.id, isLoadingHistory]);

  // Fix the initial fetch effect
  useEffect(() => {
    // Only attempt to fetch history if we're authenticated and not already loading
    if (isAuthenticated && !isLoadingHistory && Object.keys(conversationsIndex).length === 0) {
      console.debug('[SidebarHistory] Attempting initial history fetch', {
        userId: user?.id,
        isAuthenticated,
        currentHistoryCount: Object.keys(conversationsIndex).length
      });
      fetchHistory(false);
    } else if (isLoadingHistory) {
      console.debug('[SidebarHistory] Already loading history', {
        isAuthenticated,
        isLoadingHistory,
        userId: user?.id
      });
    }
  }, [isAuthenticated, user?.id, conversationsIndex, isLoadingHistory, fetchHistory]);

  // Add explicit auth state change monitoring
  useEffect(() => {
    console.debug('[SidebarHistory] Auth state changed', {
      isAuthenticated,
      userId: user?.id,
      isLoadingHistory,
      conversationCount: Object.keys(conversationsIndex).length,
      pathname
    });

    // Check if we have conversations but they're not being displayed
    if (!isAuthenticated && Object.keys(conversationsIndex).length > 0) {
      console.debug('[SidebarHistory] We have conversations but auth is not ready yet');
    }
  }, [isAuthenticated, user?.id, isLoadingHistory, conversationsIndex, pathname]);

  // Add a new effect to actually render conversations when either auth is ready OR we have conversations
  useEffect(() => {
    // If we have conversations in the store, render them regardless of auth state
    const hasConversations = Object.keys(conversationsIndex).length > 0;

    if (hasConversations || isAuthenticated) {
      console.debug('[SidebarHistory] Showing conversations:', {
        count: Object.keys(conversationsIndex).length,
        isAuthenticated,
        authDriven: !hasConversations && isAuthenticated,
        dataDriven: hasConversations
      });
    }
  }, [conversationsIndex, isAuthenticated]);

  // ** Polling Logic - ensure it also uses the correct auth check **
  const setupHistoryPolling = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }

    // Use a much longer interval (5 minutes instead of ~500s) to reduce load
    const baseInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
    const jitter = Math.floor(Math.random() * 30 * 1000); // Random jitter up to 30 seconds
    const interval = baseInterval + jitter;

    console.debug(`[SidebarHistory] Setting up history polling every ${Math.floor(interval / 1000)}s (Authenticated)`);

    const timeoutId = setTimeout(() => {
      if (!isComponentMounted.current) return;

      // Only fetch if not already loading
      if (!useChatStore.getState().isLoadingHistory) {
        console.debug('[SidebarHistory] Polling: fetching history');
        fetchHistory(false).catch(error => {
          console.error('[SidebarHistory] Error during polling history fetch:', error);
        });
      } else {
        console.debug('[SidebarHistory] Polling: skipping because already loading');
      }

      // Setup the next poll
      if (isComponentMounted.current) {
        setupHistoryPolling();
      }
    }, interval);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAuthenticated, fetchHistory]);

  // Set error message when store has errors
  useEffect(() => {
    if (historyError) {
      setErrorMessage(`Error loading chats: ${historyError}`);
    } else {
      setErrorMessage(null);
    }
  }, [historyError]);

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
      const supabase = createClient();

      // Use historyService with dependency injection
      const success = await historyService.renameChat(supabase, renameId, renameTitle.trim());

      if (!success) {
        throw new Error('Failed to rename chat');
      }

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

  // Render chat sections - simple divs, no overflow control here
  const renderChatSection = useCallback(
    (title: string, chats: Chat[], showAll = true) => {
      // Don't render empty sections
      if (!chats || chats.length === 0) return null;

      // Get the first five chats for preview
      const visibleChats = showAll ? chats : chats.slice(0, 5);
      const hasMore = !showAll && chats.length > 5;

      return (
        <div className="mb-6 last:mb-0" key={title}>
          <h2 className="mb-2 uppercase text-sm font-medium text-sidebar-foreground/50 pl-3">
            {title}
          </h2>
          <div className="space-y-0.5">
            {visibleChats?.map((chat) => (
              <PureChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === id}
                onDelete={(chatId) => handleDeleteClick(chatId)}
                onRename={(chatId, title) => handleRenameClick(chatId, title)}
                setOpenMobile={setOpenMobile}
                isDeleting={isDeleting[chat.id] || false}
              />
            ))}
            {hasMore && (
              <div className="px-3 py-2 text-sm text-muted-foreground/70 hover:text-muted-foreground cursor-pointer" onClick={() => setShowAllOlder(true)}>
                Show {chats.length - 5} more...
              </div>
            )}
          </div>
        </div>
      );
    },
    [id, isDeleting, setOpenMobile, handleDeleteClick, handleRenameClick]
  );

  // Check if we have content to display - This logic will move to the hook/consuming component
  // const hasHistory =
  //   groupedChats.today.length > 0 ||
  //   groupedChats.yesterday.length > 0 ||
  //   groupedChats.pastWeek.length > 0 ||
  //   groupedChats.older.length > 0;

  const hasHistory = historyArray.length > 0; // Temporary check

  console.debug('[SidebarHistory] History availability check:', {
    hasHistory,
    // todayCount: groupedChats.today.length,
    // yesterdayCount: groupedChats.yesterday.length,
    // pastWeekCount: groupedChats.pastWeek.length,
    // olderCount: groupedChats.older.length,
    totalCount: Object.keys(conversationsIndex).length
  });

  // Show placeholder if no history
  const renderHistoryContent = () => {
    if (isLoadingHistory) {
      return (
        <div className="h-28 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (historyError) {
      return (
        <div className="p-4 text-center">
          <div className="flex justify-center mb-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-sm text-muted-foreground mb-2">{historyError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHistory(true)} // Keep retry logic
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      );
    }

    // Skip the auth check here - render if we have data, regardless of auth state
    if (!hasHistory) { // Use temporary check
      return (
        <div className="p-4 text-center">
          <p className="text-sm text-muted-foreground">No chat history found.</p>
          <p className="text-xs text-muted-foreground mt-1">Start a new chat to begin.</p>
        </div>
      );
    }

    // Rendering logic based on grouped chats will be replaced
    return (
      <>
        {/* {renderChatSection('Today', groupedChats.today)} */}
        {/* {renderChatSection('Yesterday', groupedChats.yesterday)} */}
        {/* {renderChatSection('Past Week', groupedChats.pastWeek)} */}
        {/* {renderChatSection('Older', groupedChats.older, showAllOlder)} */}
        <p className="p-4 text-sm text-muted-foreground">(History rendering temporarily disabled during refactor)</p>
      </>
    );
  };

  // Show update dialog
  const renderRenameDialog = () => {
    return (
      <Dialog open={showRenameDialog} onOpenChange={(open) => {
        if (!open) {
          setShowRenameDialog(false);
          setRenameId(null);
          setRenameTitle('');
        }
      }}>
        <DialogContent className="sm:max-w-md" onEscapeKeyDown={() => setShowRenameDialog(false)}>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="text"
              placeholder="Enter a new title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              className="w-full"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameId) {
                  handleRenameConfirm();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!renameTitle.trim() || isRenaming[renameId || ''] || false}
            >
              {isRenaming[renameId || ''] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  // Add useEffect to start the polling
  useEffect(() => {
    if (isAuthenticated) {
      console.debug('[SidebarHistory] Starting history polling');
      const cleanup = setupHistoryPolling();
      return () => {
        if (cleanup) cleanup();
      };
    }
  }, [isAuthenticated, setupHistoryPolling]);

  // Add a function to create a new chat using the server
  const createNewChat = useCallback(async () => {
    try {
      // Get the supabase client from our utils
      const supabase = createClient();

      // Create a new UUID for the chat
      const id = crypto.randomUUID();

      // Insert the chat into the database
      const { error } = await supabase
        .from('sd_chat_sessions')
        .insert({
          id,
          title: 'New Chat',
          user_id: user?.id,
          agent_id: 'default',
          deep_search_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      // Force refresh the chat list
      refreshHistory();

      // Navigate to the new chat
      router.push(`/chat/${id}`);
    } catch (error) {
      console.error('Failed to create new chat:', error);
      toast.error('Failed to create new chat');
    }
  }, [user?.id, refreshHistory, router]);

  // Simplified render - return a Fragment containing the header and the menu
  return (
    <>
      <div className="flex flex-col gap-2 mb-4 px-2">
        <div className="flex justify-between items-center mb-4 px-2">
          <SidebarMenuButton
            onClick={refreshHistory}
            className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-sidebar-item-hover transition-colors w-full text-sidebar-foreground"
          >
            <RefreshCw className="h-5 w-5" />
            <span className="font-medium">Refresh History</span>
          </SidebarMenuButton>
        </div>

        {/* Debug indicator for circuit breaker */}
        {historyError && historyError.includes('circuit') && (
          <div className="p-2 mb-4 rounded bg-yellow-100 dark:bg-yellow-900 text-xs">
            <p>History API circuit open. Wait or reset.</p>
          </div>
        )}

        {/* Chat history list */}
        <SidebarMenu className="px-2 pb-20"> {/* Add padding here */}
          {renderHistoryContent()}
        </SidebarMenu>

        {/* Delete confirmation dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this chat and all its messages.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteId(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm}>
                {isDeleting[deleteId || ''] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rename dialog */}
        {renderRenameDialog()}
      </div>
    </>
  );
};

// Export memoized version for better performance
export const SidebarHistory = React.memo(PureSidebarHistory);
export default SidebarHistory;
