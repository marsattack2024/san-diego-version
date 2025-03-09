'use client';

import { Chat } from '@/components/chat';
import { useChatStore } from '@/stores/chat-store';
import { useEffect } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

const log = clientLogger;

export default function ChatPage() {
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const conversations = useChatStore(state => state.conversations);
  const createConversation = useChatStore(state => state.createConversation);
  
  // Check for a newChat parameter which forces creation of a new chat
  useEffect(() => {
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
        createConversation();
        
        // Remove the query parameter from the URL
        window.history.replaceState({}, '', '/chat');
      } else if (!currentConversationId) {
        // Create a conversation ID if none exists
        log.info('No current conversation, creating a new one');
        createConversation();
      } else {
        log.info('Using existing conversation', { id: currentConversationId });
      }
    }
  }, [currentConversationId, createConversation]);
  
  // Get current conversation
  const currentConversation = currentConversationId 
    ? conversations[currentConversationId] 
    : null;
  
  // If no conversation exists yet, show loading or empty state
  if (!currentConversationId || !currentConversation) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }
  
  log.info('Rendering chat with conversation', { 
    id: currentConversationId,
    messageCount: currentConversation.messages.length 
  });
  
  return (
    <Chat
      id={currentConversationId}
      initialMessages={currentConversation.messages}
      isReadonly={false}
    />
  );
} 