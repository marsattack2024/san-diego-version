'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChatStore } from '@/stores/chat-store';
import { formatDistanceToNow } from 'date-fns';
import { HistoryIcon, Trash2Icon } from 'lucide-react';
import { useEnhancedChatContext } from '@/contexts/enhanced-chat-context';
import { createLogger } from '@/utils/client-logger';
import { businessEvents } from '@/utils/client-logger';
import { ErrorBoundary } from '@/components/error-boundary';

// Create a logger for this component
const log = createLogger('components:chat-history-dropdown');

export function ChatHistoryDropdown() {
  const { conversations, currentConversationId, setCurrentConversation, deleteConversation } = useChatStore();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const { loadConversation } = useEnhancedChatContext();

  // Log when the current conversation ID changes
  useEffect(() => {
    if (currentConversationId) {
      log.debug('Current conversation ID changed', { 
        id: currentConversationId,
        timestamp: new Date().toISOString(),
        conversationCount: Object.keys(conversations).length
      });
    }
  }, [currentConversationId, conversations]);

  // Convert conversations object to array and sort by updatedAt (newest first)
  const conversationList = Object.values(conversations)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleSelectConversation = (conversationId: string) => {
    const startTime = performance.now();
    log.info('Selecting conversation', { 
      conversationId,
      previousConversationId: currentConversationId,
      timestamp: new Date().toISOString()
    });
    
    // Set the current conversation in the store
    setCurrentConversation(conversationId);
    
    // Load the conversation using the context function if available
    if (loadConversation) {
      log.debug('Loading conversation via context', { 
        conversationId,
        messageCount: conversations[conversationId]?.messages.length || 0
      });
      loadConversation(conversationId);
    } else {
      log.warn('loadConversation function not available in context', {
        conversationId,
        contextAvailable: !!useEnhancedChatContext
      });
    }
    
    const selectionTime = performance.now() - startTime;
    log.debug('Conversation selection completed', { 
      conversationId, 
      selectionTimeMs: Math.round(selectionTime),
      success: true
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    log.debug('Delete button clicked', { 
      conversationId,
      conversationTitle: conversations[conversationId]?.title || 'Untitled',
      messageCount: conversations[conversationId]?.messages.length || 0
    });
    setConversationToDelete(conversationId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;
    
    const startTime = performance.now();
    const conversation = conversations[conversationToDelete];
    
    log.info('Deleting conversation', {
      conversationId: conversationToDelete,
      conversationTitle: conversation?.title || 'Untitled',
      messageCount: conversation?.messages?.length || 0,
      createdAt: conversation?.createdAt,
      isCurrentConversation: conversationToDelete === currentConversationId,
      timestamp: new Date().toISOString()
    });
    
    try {
      await deleteConversation(conversationToDelete);
      
      // Log business event for chat deletion
      businessEvents.chatDeleted(
        typeof window !== 'undefined' ? localStorage.getItem('chat_user_id') || undefined : undefined,
        conversation?.messages?.length || 0
      );
      
      const duration = performance.now() - startTime;
      log.info('Conversation deleted successfully', {
        duration: Math.round(duration),
        remainingConversations: Object.keys(conversations).length - 1,
        timestamp: new Date().toISOString()
      });
      
      setConversationToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      log.error('Failed to delete conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId: conversationToDelete,
        timestamp: new Date().toISOString()
      });
    }
  };

  return (
    <ErrorBoundary componentName="ChatHistoryDropdown">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <HistoryIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Chat History</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {conversationList.length === 0 ? (
            <DropdownMenuItem disabled>No chat history</DropdownMenuItem>
          ) : (
            conversationList.map((conversation) => (
              <DropdownMenuItem
                key={conversation.id}
                className={
                  conversation.id === currentConversationId
                    ? 'bg-accent text-accent-foreground'
                    : ''
                }
                onClick={() => handleSelectConversation(conversation.id)}
              >
                <div className="flex justify-between items-center w-full">
                  <div className="truncate mr-2">
                    {conversation.title || `Chat ${conversation.id.substring(0, 6)}`}
                    <div className="text-xs text-muted-foreground">
                      {conversation.messages.length} messages • {formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-2 opacity-50 hover:opacity-100"
                    onClick={(e) => handleDeleteClick(e, conversation.id)}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
} 