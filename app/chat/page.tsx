'use client';

export const dynamic = 'force-dynamic';

import { Chat } from '@/components/chat';
import { useChatStore } from '@/stores/chat-store';
import { useEffect, useState } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const log = clientLogger;

export default function ChatPage() {
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const conversations = useChatStore(state => state.conversations);
  const createConversation = useChatStore(state => state.createConversation);
  const setCurrentConversation = useChatStore(state => state.setCurrentConversation);
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Fetch chat history from the server
  const { data: history, isLoading: historyLoading } = useSWR('/api/history', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000, // 10 seconds
  });
  
  // Check for a newChat parameter which forces creation of a new chat
  useEffect(() => {
    if (historyLoading) return; // Wait for history to load
    
    // Check if the URL contains the newChat parameter and timestamp
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isNewChat = urlParams.get('new') === 'true';
      const timestamp = urlParams.get('t');
      
      if (isNewChat) {
        // Force creation of a new chat and clear existing conversation
        log.info('Creating new chat from URL parameter', { timestamp });
        
        // Clear existing conversation state first to ensure full refresh
        useChatStore.setState({
          currentConversationId: null
        });
        
        // Create a new conversation
        const newId = createConversation();
        
        // Remove the query parameter from the URL
        window.history.replaceState({}, '', '/chat');
        setIsInitialized(true);
      } else if (!currentConversationId) {
        // If no current conversation, try to load the most recent one from history
        if (history && history.length > 0) {
          const mostRecentChat = history[0]; // History is sorted by updated_at desc
          log.info('Loading most recent chat from history', { id: mostRecentChat.id });
          
          // Redirect to the specific chat page
          router.push(`/chat/${mostRecentChat.id}`);
        } else {
          // If no history, create a new conversation
          log.info('No chat history found, creating a new one');
          createConversation();
          setIsInitialized(true);
        }
      } else {
        log.info('Using existing conversation', { id: currentConversationId });
        setIsInitialized(true);
      }
    }
  }, [currentConversationId, createConversation, history, historyLoading, router]);
  
  // Get current conversation
  const currentConversation = currentConversationId 
    ? conversations[currentConversationId] 
    : null;
  
  // If no conversation exists yet or we're still loading, show loading state
  if (historyLoading || !isInitialized || (!currentConversationId && !currentConversation)) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }
  
  log.info('Rendering chat with conversation', { 
    id: currentConversationId,
    messageCount: currentConversation?.messages?.length || 0
  });
  
  return (
    <Chat
      id={currentConversationId!}
      initialMessages={currentConversation?.messages || []}
      isReadonly={false}
    />
  );
} 