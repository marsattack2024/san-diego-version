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
  RefreshCcw, 
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
  pastWeek: Chat[];
  older: Chat[];
};

// Simplified and standardized groupChatsByDate function
const groupChatsByDate = (chats: Array<Chat>): GroupedChats => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWeekDate = new Date(today);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  
  return {
    today: chats.filter((chat) => {
      const chatDate = new Date(chat.updatedAt || chat.createdAt);
      return chatDate >= today;
    }),
    pastWeek: chats.filter((chat) => {
      const chatDate = new Date(chat.updatedAt || chat.createdAt);
      return chatDate < today && chatDate >= lastWeekDate;
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
    <SidebarMenuItem>
      <Link href={`/chat/${chat.id}`}>
        <SidebarMenuButton
          asChild={false}
          isActive={isActive}
          className="flex items-center group"
          onClick={() => setOpenMobile(false)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MessageSquare size={16} />
            <span className="truncate">{chat.title || "New Chat"}</span>
          </div>
        </SidebarMenuButton>
      </Link>
      
      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-sidebar-foreground/50 hover:text-sidebar-foreground"
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

const PureSidebarHistory = ({ user }: { user: User | undefined }) => {
  const { setOpenMobile } = useSidebar();
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
  
  // Optimized function to fetch chat history using the service
  const fetchChatHistory = useCallback(async (forceRefresh = false) => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    setErrorMessage('');
    
    try {
      // Check if user is authenticated before fetching
      const hasCookies = historyService.checkForAuthCookies();
      
      if (!hasCookies) {
        console.warn('No auth cookies found, cannot fetch history');
        setErrorMessage('Please log in to view your chat history');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
      
      const historyData = await historyService.fetchHistory(forceRefresh);
      
      // Handle empty array as a valid response (not an error)
      if (Array.isArray(historyData)) {
        setHistory(historyData);
        // Only show no history message when we've confirmed array is empty and loading is done
        setIsEmpty(historyData.length === 0);
      } else {
        console.error('History data is not an array:', historyData);
        setErrorMessage('Unable to load chat history');
        setIsEmpty(true);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load chat history');
      // Set empty state to show appropriate UI
      setIsEmpty(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isRefreshing]);
  
  // Update the initial fetch effect with a delay to allow auth to settle
  useEffect(() => {
    // Skip the fetch if user auth has failed
    const isLoggedIn = !!user?.id;
    const hasAuthFailed = historyService.isInAuthFailure();
    
    if (!isLoggedIn) {
      setChatWarning('Please log in to see chat history.');
      setIsLoading(false);
      return;
    }
    
    if (hasAuthFailed) {
      const { remainingTime } = historyService.getAuthFailureInfo();
      setChatWarning(`Authentication issue. Will retry in ${Math.round(remainingTime/60)}m ${Math.round(remainingTime/1000) % 60}s.`);
      setIsLoading(false);
      return;
    }
    
    // CRITICAL FIX: Add a longer delay before initial fetch to allow auth cookies to settle
    const timer = setTimeout(() => {
      console.log('Initial history fetch after delay');
      fetchChatHistory();
    }, 2500); // 2.5 second delay
    
    return () => clearTimeout(timer);
  }, [fetchChatHistory, user?.id]);

  // Add throttled fetch function to reduce API calls
  const throttledFetchChatHistory = useCallback(
    throttle((forceRefresh = false) => {
      if (!isRefreshing && user?.id && isPageVisible()) {
        fetchChatHistory(forceRefresh);
      }
    }, 10000), // 10 second throttle
    [user?.id, isRefreshing]
  );
  
  // Setup polling for history updates with adaptive intervals
  useEffect(() => {
    // Skip polling completely if no user or no user ID
    if (!user?.id) return;
    
    // Don't set up polling if we should skip it
    if (!shouldPoll()) return;
    
    // Determine polling interval based on device type
    const pollingInterval = isMobile ? 
      getMobilePollInterval() : 
      getDesktopPollInterval();
    
    // Add jitter to prevent synchronized requests
    const jitter = Math.floor(Math.random() * 5000);
    const effectiveInterval = pollingInterval + jitter;
    
    console.log(`Setting up history polling: ${Math.round(effectiveInterval/1000)}s`);
    
    // Set up polling interval with adaptive timing
    const intervalId = setInterval(() => {
      // Only fetch if page is visible and not already refreshing
      if (isPageVisible() && !isRefreshing) {
        console.log('Running scheduled history check');
        throttledFetchChatHistory(false);
      } else {
        console.log('Skipping history poll: ' + 
          (!isPageVisible() ? 'page not visible' : 'already refreshing'));
      }
    }, effectiveInterval);
    
    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [throttledFetchChatHistory, isMobile, user?.id]);
  
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
          <p className="text-sm text-sidebar-foreground/70">No chats found</p>
          <Link
            href="/chat"
            className="text-xs text-blue-500 hover:underline"
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
      <div className="space-y-2">
        {/* Today's chats */}
        {groupedChats.today.length > 0 && (
          <>
            <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
              Today
            </div>
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
          </>
        )}

        {/* Past week */}
        {groupedChats.pastWeek.length > 0 && (
          <>
            <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-6">
              Past 7 days
            </div>
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
          </>
        )}

        {/* Older */}
        {groupedChats.older.length > 0 && (
          <>
            <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-6">
              Older ({groupedChats.older.length})
            </div>
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
                  className="w-full text-xs py-1 text-blue-500 hover:underline text-center"
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
          </>
        )}
      </div>
    );
  };

  // Main component render
  return (
    <div className="sidebar-history relative">
      <SidebarGroup className="flex-shrink-0">
        <SidebarGroupLabel>
          <div className="flex items-center justify-between">
            <span>Chat History</span>
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
              
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-muted"
                onClick={() => {
                  setError(null);
                  setIsRefreshing(true);
                  setIsLoading(true);
                  fetchChatHistory(true);
                }}
                title="Refresh history"
                disabled={isRefreshing}
              >
                <RefreshCcw
                  className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                />
                <span className="sr-only">Refresh</span>
              </Button>
            </div>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
                <p>No chat history found</p>
                <p className="text-sm mt-1">Start a new conversation to get started</p>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-destructive px-4">
                <p>{errorMessage}</p>
                <button 
                  className="text-sm mt-2 px-3 py-1 bg-muted rounded-md hover:bg-muted/80 transition-colors"
                  onClick={() => fetchChatHistory(true)}
                >
                  Try Again
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
                <p>No chat history found</p>
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

// Wrap the component to track instances and prevent double-mounting issues
export const SidebarHistory: React.FC<{ user: User | undefined }> = (props) => {
  // Create a unique instance ID for debugging
  const instanceId = React.useRef(++instanceCounter).current;
  
  // Track component mounting/unmounting
  React.useEffect(() => {
    console.log(`SidebarHistory instance ${instanceId} mounted`);
    
    // Immediately check for auth failure to prevent initial request spam
    if (historyService.isInAuthFailure()) {
      const failureInfo = historyService.getAuthFailureInfo();
      console.log(`SidebarHistory instance ${instanceId} started in auth failure state`, {
        remainingSecs: Math.round(failureInfo.remainingTime / 1000)
      });
    }
    
    return () => {
      console.log(`SidebarHistory instance ${instanceId} unmounted`);
    };
  }, [instanceId]);
  
  return <MemoizedSidebarHistory {...props} />;
};

// Default export uses the wrapped component
export default SidebarHistory;
