'use client';

import { Chat } from '@/components/chat';
import { useChatStore } from '@/stores/chat-store';
import { useEffect } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

const log = clientLogger;

interface ChatClientProps {
  chatId: string;
}

export function ChatClient({ chatId }: ChatClientProps) {
  const { conversations, setCurrentConversation, createConversation } = useChatStore();
  
  useEffect(() => {
    if (chatId) {
      if (conversations[chatId]) {
        // If the conversation exists, set it as current
        setCurrentConversation(chatId);
        log.info('Using existing conversation', { id: chatId });
      } else {
        // If the conversation doesn't exist in the store, create a new one with the same ID
        // This is a temporary fix until Supabase tables are set up
        log.info('Conversation not found, creating a new one with the requested ID', { id: chatId });
        
        // We'll manually add a conversation with this ID to the store
        const timestamp = new Date().toISOString();
        const selectedAgentId = useChatStore.getState().selectedAgentId;
        
        // Add the conversation to the store
        useChatStore.setState((state) => ({
          conversations: {
            ...state.conversations,
            [chatId]: {
              id: chatId,
              messages: [],
              createdAt: timestamp,
              updatedAt: timestamp,
              agentId: selectedAgentId,
              deepSearchEnabled: state.deepSearchEnabled,
            },
          },
          currentConversationId: chatId,
        }));
      }
    }
  }, [chatId, conversations, setCurrentConversation, createConversation]);

  // Get the conversation (either existing or newly created)
  const currentConversation = conversations[chatId] || {
    id: chatId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agentId: useChatStore.getState().selectedAgentId,
  };

  return (
    <Chat
      id={chatId}
      initialMessages={currentConversation.messages}
      isReadonly={false}
    />
  );
} 