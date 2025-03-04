'use client';

import { EnhancedChat } from '../../components/chat/enhanced-chat';
import { EnhancedChatProvider } from '../../contexts/enhanced-chat-context';
import { useCallback, useState } from 'react';

export default function ChatPage() {
  // State to track the current loadConversation function
  const [loadConversationFn, setLoadConversationFn] = useState<
    ((conversationId: string) => void) | undefined
  >(undefined);
  
  // Callback to register the loadConversation function
  const registerLoadConversation = useCallback((fn: (conversationId: string) => void) => {
    setLoadConversationFn(() => fn);
  }, []);
  
  return (
    <EnhancedChatProvider value={{ loadConversation: loadConversationFn }}>
      <div className="h-screen">
        <EnhancedChat 
          apiEndpoint="/api/chat" 
          onRegisterLoadConversation={registerLoadConversation}
        />
      </div>
    </EnhancedChatProvider>
  );
} 