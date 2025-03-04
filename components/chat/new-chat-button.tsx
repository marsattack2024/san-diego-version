'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { createLogger } from '@/utils/client-logger';
import { useChatStore } from '@/stores/chat-store';
import { useCallback } from 'react';

const log = createLogger('components:new-chat-button');

export function NewChatButton() {
  // Get the clearConversation function from the chat store
  const clearConversation = useChatStore(state => state.clearConversation);
  
  const handleNewChat = useCallback(() => {
    const startTime = performance.now();
    log.info('Starting new chat', { timestamp: new Date().toISOString() });
    
    // Clear URL parameters first to avoid regenerating the last query
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const hadParams = url.search.length > 0;
      url.search = '';
      window.history.replaceState({}, '', url.toString());
      log.debug('Cleared URL parameters', { hadParams });
    }
    
    // Clear all chat-related localStorage items
    if (typeof window !== 'undefined') {
      // Only clear chat-related items
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('chat-') || key.includes('chat'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      log.debug('Cleared chat localStorage items', { 
        count: keysToRemove.length,
        keys: keysToRemove
      });
    }
    
    // Clear the conversation in the store
    const newConversationId = clearConversation();
    log.debug('Created new conversation', { 
      id: newConversationId,
      timestamp: new Date().toISOString()
    });
    
    // Force a complete remount of the component by reloading the page
    // This is the most reliable way to ensure all state is reset
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        
        log.info('Reloading page for new chat', { 
          durationMs: duration,
          newConversationId
        });
        
        // Force reload the page without using the cache
        window.location.href = window.location.pathname;
      }
    }, 100);
  }, [clearConversation]);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            className="flex items-center gap-1 hover:bg-slate-100"
            data-testid="new-chat-button"
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Start a new conversation</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 