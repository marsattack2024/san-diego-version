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
      <Link href={`/chat/${chat.id}`} onClick={() => setOpenMobile(false)} legacyBehavior>
        <SidebarMenuButton
          asChild={false}
          isActive={isActive}
          className="flex items-center group"
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
  // Add debugging counter
  const [renderCount, setRenderCount] = useState(0);
  
  // Log render cycle for debugging - FIXED to avoid infinite loop
  useEffect(() => {
    // Only increment on mount and when key data changes
    setRenderCount(prev => prev + 1);
    console.log(`SidebarHistory rendered (count: ${renderCount + 1})`, {
      historyLength: history.length,
      isLoading,
      isRefreshing,
      userId: user?.id?.slice(0, 8)
    });
    // Removed renderCount from dependencies
  }, [history.length, isLoading, isRefreshing, user?.id]);
  
  // Optimized function to fetch chat history using the service
  const fetchChatHistory = useCallback(async (forceRefresh = false, isManual = false) => {
    // Prevent duplicate requests while another fetch is in progress
    if ((isLoading && !forceRefresh) || isRefreshing) {
      console.log('Skipping fetch: already loading or refreshing');
      return;
    }
    
    try {
      // Set appropriate loading state
      if (history.length === 0) {
        setIsLoading(true);
      } else if (forceRefresh) {
        setIsRefreshing(true);
      }
      
      setError(null);
      
      // Let the historyService handle caching and optimizations
      const data = await historyService.fetchHistory(forceRefresh);
      
      // Only update state if the data has actually changed
      const currentIds = history.map(chat => chat.id).sort().join(',');
      const newIds = data.map(chat => chat.id).sort().join(',');
      
      if (currentIds !== newIds || history.length !== data.length) {
        console.log('History data changed, updating state');
        setHistory(data);
      } else {
        console.log('History data unchanged, skipping update');
      }
      
      // Clear any existing warning after successful fetch
      setChatWarning(null);
      
      // Update lastRefresh timestamp
      setLastRefresh(Date.now());
      
      // Show success toast ONLY for manual refreshes
      if (isManual) {
        toast.success('Chat history refreshed', {
          duration: 2000,
          position: 'bottom-right'
        });
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [history, isLoading, isRefreshing]);
  
  // Initial fetch when component mounts or user changes
  useEffect(() => {
    // Don't fetch if user isn't logged in
    if (!user) {
      setHistory([]);
      return;
    }
    
    // Log initial load attempt
    console.log('Initial SidebarHistory mount with user - attempting history fetch');
    
    // Always force refresh on initial component mount to ensure data is fresh
    fetchChatHistory(true, false); // Force refresh but not manual
    
    // Cleanup
    return () => {
      console.log('SidebarHistory unmounted');
    };
  }, [user, fetchChatHistory]); // Only depend on user - this effect should run only once when user is available

  // Update history-service.ts polling mechanism
  useEffect(() => {
    if (!user) return;
    
    // Set up polling to refresh data periodically
    const interval = setInterval(() => {
      if (!isRefreshing && !isLoading) {
        console.log('Auto-refreshing chat history (background)');
        fetchChatHistory(true, false); // Force refresh but not manual
      }
    }, 30000); // Poll every 30 seconds
    
    return () => clearInterval(interval);
  }, [user, fetchChatHistory, isRefreshing, isLoading]);
  
  // Manual refresh function for the refresh button
  const refreshHistory = useCallback(async () => {
    console.log('Manually refreshing chat history (button click)');
    await fetchChatHistory(true, true); // Force refresh AND manual (show toast)
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
        fetchChatHistory(true, false);
        localStorage.setItem('lastHistoryUpdate', now.toString());
      }
    }
  }, [user, id, pathname, fetchChatHistory, history.length]);

  // Add auto-retry when errors occur
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        console.log('Auto-retrying after error');
        fetchChatHistory(true, false);
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
              <ChatItem
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
              <ChatItem
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
                  <ChatItem
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
                <ChatItem
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
    <>
      <SidebarGroup className="flex-shrink-0">
        <SidebarGroupLabel>
          {chatWarning ? (
            <div className="flex items-center justify-between px-2 py-2 bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs rounded mb-2">
              <div className="flex items-center">
                <AlertCircle className="h-3 w-3 mr-1.5" />
                <span className="truncate">{chatWarning}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-orange-800 dark:text-orange-300 hover:text-orange-600 dark:hover:text-orange-100 hover:bg-orange-200 dark:hover:bg-orange-900/50"
                onClick={refreshHistory}
                disabled={isRefreshing}
              >
                <RefreshCcw className="h-3 w-3" />
              </Button>
            </div>
          ) : null}
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-xs font-medium text-sidebar-foreground/70">
              Chat History
            </span>
            <div className="flex space-x-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                onClick={refreshHistory}
                disabled={isRefreshing}
              >
                <RefreshCcw
                  className={`h-3.5 w-3.5 ${
                    isRefreshing ? 'animate-spin' : ''
                  }`}
                />
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
    </>
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

// Export the component with memoization
export const SidebarHistory = React.memo(PureSidebarHistory, (prevProps, nextProps) => {
  // Only re-render if the user ID changes
  return prevProps.user?.id === nextProps.user?.id;
});

export default SidebarHistory;
