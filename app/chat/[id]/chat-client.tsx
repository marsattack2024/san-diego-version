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
  const { conversations, setCurrentConversation } = useChatStore();
  
  useEffect(() => {
    if (chatId && conversations[chatId]) {
      setCurrentConversation(chatId);
    }
  }, [chatId, conversations, setCurrentConversation]);

  const currentConversation = conversations[chatId];
  
  if (!currentConversation) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div>Conversation not found</div>
      </div>
    );
  }

  return (
    <Chat
      id={chatId}
      initialMessages={currentConversation.messages}
      isReadonly={false}
    />
  );
} 