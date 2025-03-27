'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  PlusCircle
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import {
  MoreHorizontalIcon,
  TrashIcon,
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
  setOpenMobile,
  isDeleting = false,
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
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
                onDelete(chat.id);
              }}
              className="text-red-500 hover:text-red-600 focus:text-red-500"
              disabled={isDeleting}
            >
              <TrashIcon size={16} />
              <span>{isDeleting ? "Deleting..." : "Delete"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  );
};

// Add className to the props interface
// interface PureSidebarHistoryProps {
//  onChatSelected: (chatId: string) => void;
//  selectedChatId?: string;
//  className?: string;
// }

// Module-level request tracking for global deduplication
const pendingHistoryRequests: {
  timestamp: number;
  promise: Promise<Chat[]> | null;
} = {
  timestamp: 0,
  promise: null
};

const PureSidebarHistory = ({ user }: { user: User | undefined }) => {
  const { setOpenMobile, openMobile } = useSidebar();
  const params = useParams();
  const id = params?.id as string;
  const pathname = usePathname();
  const router = useRouter();
  const [history, setHistory] = useState<Array<Chat>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [chatWarning, setChatWarning] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // State for showing all older chats
  const [showAllOlder, setShowAllOlder] = useState(false);
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper functions for polling
  const detectMobile = () => {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  };

  const getMobilePollInterval = () => 5 * 60 * 1000; // 5 minutes for mobile
  const getDesktopPollInterval = () => 2 * 60 * 1000; // 2 minutes for desktop

  // Should polling be enabled
  const shouldPoll = () => {
    // Skip polling on low-powered devices or if auth failure
    return !isMobile || !historyService.isInAuthFailure();
  };

  // Check if page is visible
  const isPageVisible = () => {
    return typeof document !== 'undefined' &&
      document.visibilityState === 'visible';
  };

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
  }, []);

  // Log render cycle for debugging - FIXED to avoid infinite loop
  useEffect(() => {
    console.log(`SidebarHistory rendered`, {
      historyLength: history.length,
      isLoading,
      isRefreshing,
      userId: user?.id?.slice(0, 8)
    });
    // Completely removed the renderCount increment to avoid the infinite loop
  }, [history.length, isLoading, isRefreshing, user?.id]);

  // Add this at the right scope level
  const getSupabase = () => createClient();

  // Optimized function to fetch chat history using the service with global deduplication
  const fetchChatHistory = useCallback(async (forceRefresh = false) => {
    // Skip if already refreshing
    if (isRefreshing) return;

    const now = Date.now();
    const timeSinceLastRequest = now - pendingHistoryRequests.timestamp;

    // Add a property to track if this is being called from mobile sidebar open
    const isMobileOpen = isMobile && openMobile;

    // If not forcing and a recent request was made, use existing data
    // But make an exception for mobile sidebar open events
    if (!forceRefresh && !isMobileOpen && timeSinceLastRequest < 60000 && pendingHistoryRequests.promise) {
      console.log(`Using existing history data from ${Math.round(timeSinceLastRequest / 1000)}s ago`);
      return pendingHistoryRequests.promise;
    }

    setIsRefreshing(true);
    setErrorMessage('');

    // Create a single promise for all requests in this timeframe
    pendingHistoryRequests.timestamp = now;
    pendingHistoryRequests.promise = (async () => {
      try {
        // CRITICAL FIX #1: First check if auth cookies exist
        const hasCookies = historyService.checkForAuthCookies();

        if (!hasCookies) {
          console.warn('No auth cookies found, cannot fetch history');
          setErrorMessage('Please log in to view your chat history');
          setIsLoading(false);
          return [];
        }

        // CRITICAL FIX #2: Check if auth is fully ready before fetching
        // This prevents 401 errors from occurring during initial page load
        const authReady = await historyService.isAuthReady();
        if (!authReady) {
          console.log('Auth not ready yet, waiting before fetching history...');

          // Don't show error message during normal startup
          if (isLoading) {
            setErrorMessage('Preparing your history...');
          }

          // Set up retry with exponential backoff
          const retryDelay = Math.min(2000 + Math.random() * 1000, 8000);
          console.log(`Will retry history fetch in ${Math.round(retryDelay / 1000)}s`);

          // Schedule retry
          setTimeout(() => {
            // Only retry if we're still in the loading state or this was a forced refresh
            if (isLoading || forceRefresh) {
              console.log('Retrying history fetch after auth delay');
              fetchChatHistory(forceRefresh);
            }
          }, retryDelay);

          return [];
        }

        // Auth is ready, proceed with history fetch
        console.log('Auth is ready, fetching history...');
        const historyData = await historyService.fetchHistory(forceRefresh, isMobileOpen);

        // Handle empty array as a valid response (not an error)
        if (Array.isArray(historyData)) {
          setHistory(historyData);
          // Only show no history message when we've confirmed array is empty and loading is done
          setIsEmpty(historyData.length === 0);
          setError(null);
          setErrorMessage('');
        }

        setIsLoading(false);
        return historyData;
      } catch (error) {
        console.error('Error fetching chat history:', error);
        setErrorMessage('Failed to load chat history');
        setError(error instanceof Error ? error : new Error('Unknown error'));
        setIsLoading(false);
        return [];
      } finally {
        setIsRefreshing(false);
      }
    })();

    // Return the shared promise
    return pendingHistoryRequests.promise;
  }, [setError, setErrorMessage, setHistory, setIsEmpty, setIsLoading, setIsRefreshing, isLoading, isMobile, openMobile]);

  // Add throttled fetch function to reduce API calls
  const throttledFetchChatHistory = useCallback(
    throttle((forceRefresh = false) => {
      if (!isRefreshing && user?.id && isPageVisible()) {
        fetchChatHistory(forceRefresh);
      }
    }, 30000), // 30 second throttle (increased from 10s)
    [user?.id, isRefreshing, fetchChatHistory]
  );

  // Add proper tab visibility tracking
  useEffect(() => {
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible' && user?.id) {
        console.log('Tab became visible, refreshing history once');
        fetchChatHistory(false);
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    return () => document.removeEventListener('visibilitychange', visibilityHandler);
  }, [fetchChatHistory, user?.id]);

  // Add a new effect to fetch history when mobile sidebar is opened
  useEffect(() => {
    if (isMobile && openMobile && user?.id) {
      console.log('Mobile sidebar opened, fetching history');
      fetchChatHistory(false);
    }
  }, [isMobile, openMobile, fetchChatHistory, user?.id]);

  // Initial fetch on mount
  useEffect(() => {
    if (!user?.id) return;

    console.log('Initial history fetch on component mount');
    fetchChatHistory(false);
  }, [fetchChatHistory, user?.id]);

  // Setup polling for history updates with adaptive intervals
  useEffect(() => {
    // Skip polling completely if no user or no user ID
    if (!user?.id) return;

    // Don't set up polling if we should skip it
    if (!shouldPoll()) return;

    // Determine polling interval based on device type with much longer intervals
    // IMPORTANT: Increased intervals significantly to reduce API load and improve responsiveness
    const pollingInterval = isMobile ?
      15 * 60 * 1000 : // 15 minutes for mobile (increased from 10)
      8 * 60 * 1000;   // 8 minutes for desktop (increased from 5)

    // Add jitter to prevent synchronized requests from multiple clients/tabs
    // Using a larger jitter window to better distribute requests
    const jitter = Math.floor(Math.random() * 45000); // 0-45s jitter (increased from 15s)
    const effectiveInterval = pollingInterval + jitter;

    console.log(`Setting up history polling: ${Math.round(effectiveInterval / 1000)}s`);

    // Initial delayed fetch after component mount
    // This helps prevent all components from fetching simultaneously on page load
    const initialDelay = Math.floor(Math.random() * 5000); // 0-5s initial delay
    const initialFetchTimeout = setTimeout(() => {
      if (isPageVisible() && !isRefreshing && !historyService.isInAuthFailure()) {
        console.log('Running initial delayed history fetch');
        throttledFetchChatHistory(false);
      }
    }, initialDelay);

    // Set up polling interval with adaptive timing
    const intervalId = setInterval(() => {
      // Only fetch if page is visible, not already refreshing, and no auth failure
      if (isPageVisible() && !isRefreshing && !historyService.isInAuthFailure()) {
        console.log('Running scheduled history check');
        throttledFetchChatHistory(false);
      } else {
        if (Math.random() < 0.3) { // Only log 30% of skips to reduce console noise
          console.log('Skipping history poll: ' +
            (!isPageVisible() ? 'page not visible' : isRefreshing ? 'already refreshing' : 'auth failure'));
        }
      }
    }, effectiveInterval);

    // Clean up interval and timeout on unmount
    return () => {
      clearInterval(intervalId);
      clearTimeout(initialFetchTimeout);
    };
  }, [throttledFetchChatHistory, isMobile, user?.id, isRefreshing]);

  // Manual refresh function for the refresh button
  const refreshHistory = useCallback(async () => {
    console.log('Manually refreshing chat history (button click)');
    await fetchChatHistory(true); // Force refresh AND manual (show toast)
  }, [fetchChatHistory]);

  // Handle navigation back to main chat page
  useEffect(() => {
    if (user && pathname === '/chat' && !id && history.length > 0) {
      // Only refresh when returning to main chat page
      const lastUpdateTime = localStorage.getItem('lastHistoryUpdate');
      const now = Date.now();

      // Only refresh if we haven't updated in the last minute
      if (!lastUpdateTime || now - parseInt(lastUpdateTime) > 60000) {
        console.log('Refreshing history after returning to chat main page');
        fetchChatHistory(true);
        localStorage.setItem('lastHistoryUpdate', now.toString());
      }
    }
  }, [user, id, pathname, fetchChatHistory, history.length]);

  // Add auto-retry when errors occur
  useEffect(() => {
    if (error) {
      // Don't retry if we're in auth failure state
      if (historyService.isInAuthFailure()) {
        console.log('Skipping auto-retry due to auth failure state');
        return;
      }

      const timer = setTimeout(() => {
        console.log('Auto-retrying after error');
        fetchChatHistory(true);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [error, fetchChatHistory]);

  // When navigating between chats, check if the current chat exists in history
  useEffect(() => {
    // Only check if we have an ID, we're not loading, we have history, and we're on a chat page
    if (id && !isLoading && history.length > 0 && pathname?.startsWith('/chat/')) {
      const chatExists = history.some(chat => chat.id === id);

      if (!chatExists) {
        console.warn('Current chat ID not found in history:', id);
        setChatWarning(`Chat ${id.slice(0, 8)}... not found in your history`);

        // Automatically refresh to see if it appears
        refreshHistory();
      } else {
        // Clear any warning if the chat exists
        setChatWarning(null);
      }
    }
  }, [id, history, isLoading, pathname, refreshHistory]);

  // Delete a chat with confirmation
  const handleDeleteWithConfirmation = useCallback((chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  }, []);

  // Handle delete function with state management
  const handleDelete = useCallback(async (chatId: string) => {
    if (!chatId) return;

    try {
      setIsDeleting(prev => ({ ...prev, [chatId]: true }));
      await historyService.deleteChat(chatId);

      // Update the history in memory
      setHistory(prev => prev.filter(chat => chat.id !== chatId));

      // If we delete the current chat, navigate to main chat page
      if (id === chatId) {
        router.push('/chat');
      }

      // Show success toast in development mode
      if (process.env.NODE_ENV === 'development') {
        toast.success('Chat deleted successfully', {
          duration: 2000,
          position: 'bottom-right'
        });
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    } finally {
      setIsDeleting(prev => ({ ...prev, [chatId]: false }));
    }
  }, [router, id]);

  // Function to handle delete confirmation
  const handleConfirmDelete = useCallback(() => {
    if (deleteId) {
      handleDelete(deleteId);
      setShowDeleteDialog(false);
    }
  }, [deleteId, handleDelete]);

  // Render grouped chats and empty state
  const renderChats = (chats: Array<Chat>) => {
    if (chats.length === 0 && !isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-center space-y-2">
          <p className="text-base text-sidebar-foreground/70">No chats found</p>
          <Link
            href="/chat"
            className="text-sm text-primary hover:underline font-medium"
            onClick={() => setOpenMobile(false)}
          >
            Start a new chat
          </Link>
        </div>
      );
    }

    // Group chats by date
    const groupedChats = groupChatsByDate(chats);

    return (
      <div className="space-y-6 pt-1">
        {/* Today's chats */}
        {groupedChats.today.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-sm font-semibold text-sidebar-foreground mb-2">
              Today
            </div>
            <div className="space-y-1">
              {groupedChats.today.map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteWithConfirmation}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Yesterday's chats */}
        {groupedChats.yesterday.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-sm font-semibold text-sidebar-foreground mb-2">
              Yesterday
            </div>
            <div className="space-y-1">
              {groupedChats.yesterday.map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteWithConfirmation}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past week */}
        {groupedChats.pastWeek.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-sm font-semibold text-sidebar-foreground mb-2">
              Past 7 days
            </div>
            <div className="space-y-1">
              {groupedChats.pastWeek.map((chat) => (
                <PureChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === id}
                  onDelete={handleDeleteWithConfirmation}
                  setOpenMobile={setOpenMobile}
                  isDeleting={isDeleting[chat.id] || false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Older */}
        {groupedChats.older.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-sm font-semibold text-sidebar-foreground mb-2">
              Older ({groupedChats.older.length})
            </div>
            <div className="space-y-1">
              {/* Show limited number of older chats if there are many */}
              {groupedChats.older.length > 10 ? (
                <>
                  {(showAllOlder ? groupedChats.older : groupedChats.older.slice(0, 10)).map((chat) => (
                    <PureChatItem
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === id}
                      onDelete={handleDeleteWithConfirmation}
                      setOpenMobile={setOpenMobile}
                      isDeleting={isDeleting[chat.id] || false}
                    />
                  ))}
                  <button
                    onClick={() => setShowAllOlder(!showAllOlder)}
                    className="w-full text-sm py-2 text-primary hover:underline text-center font-medium"
                  >
                    {showAllOlder ? "Show less" : `Show ${groupedChats.older.length - 10} more`}
                  </button>
                </>
              ) : (
                // Just show all if there are 10 or fewer
                groupedChats.older.map((chat) => (
                  <PureChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === id}
                    onDelete={handleDeleteWithConfirmation}
                    setOpenMobile={setOpenMobile}
                    isDeleting={isDeleting[chat.id] || false}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Main component render
  return (
    <div className="sidebar-history relative h-full overflow-hidden border-r border-border">
      <SidebarGroup className="flex-shrink-0 h-full overflow-hidden flex flex-col">
        <SidebarGroupLabel>
          <div className="flex items-center justify-between">
            <div className="flex-1"></div>
            <div className="flex items-center gap-1">
              {error || chatWarning ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-1">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-60 text-sm">
                      {error?.message || chatWarning || "Warning"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent className="overflow-y-auto pb-20">
          <SidebarMenu>
            {isLoading ? (
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
                  onClick={() => fetchChatHistory(true)}
                >
                  Try Again
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
                <p className="text-base">No chat history found</p>
                <p className="text-sm mt-1">Start a new conversation to get started</p>
              </div>
            ) : (
              renderChats(history)
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat and all of its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Properly memoize the component to prevent unnecessary re-renders
export const ChatItem = React.memo(PureChatItem, (prevProps, nextProps) => {
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.chat.id === nextProps.chat.id &&
    prevProps.chat.title === nextProps.chat.title &&
    prevProps.isDeleting === nextProps.isDeleting
  );
});

// Add component display name for easier debugging
ChatItem.displayName = 'ChatItem';

// Create a module variable to track component instance for debugging
let instanceCounter = 0;

// Create the memoized component
const MemoizedSidebarHistory = React.memo(PureSidebarHistory, (prevProps, nextProps) => {
  // Only re-render if the user ID changes
  return prevProps.user?.id === nextProps.user?.id;
});

// Add component display name for easier debugging
MemoizedSidebarHistory.displayName = 'SidebarHistory';

// Export the component
export const SidebarHistory = MemoizedSidebarHistory;

// Default export uses the wrapped component
export default MemoizedSidebarHistory;
