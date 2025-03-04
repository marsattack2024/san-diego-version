'use client';

import { useChatStore } from '@/stores/chat-store';

export function ChatHistory() {
  const { conversations, currentConversationId, setCurrentConversation } = useChatStore();
  
  return (
    <div className="chat-history-sidebar absolute right-0 top-16 w-64 h-[calc(100vh-4rem)] bg-background border-l shadow-lg z-10 overflow-y-auto">
      <div className="p-4">
        <h2 className="font-semibold mb-4">Chat History</h2>
        
        <div className="space-y-2">
          {Object.values(conversations).length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          ) : (
            Object.values(conversations)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((conversation) => (
                <div 
                  key={conversation.id}
                  className={`p-2 rounded cursor-pointer hover:bg-muted ${
                    conversation.id === currentConversationId ? 'bg-muted' : ''
                  }`}
                  onClick={() => setCurrentConversation(conversation.id)}
                >
                  <p className="text-sm truncate">
                    {conversation.title || 'New Conversation'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(conversation.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

