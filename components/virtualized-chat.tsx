'use client';

import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message } from 'ai';
import { Vote } from '@/lib/db/schema';
import { useScrollStore } from '@/stores/scroll-store';
import { PreviewMessage, ThinkingMessage } from './message';
import { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { ChatRequestOptions } from 'ai';
import { Overview } from './overview';

interface VirtualizedChatProps {
  chatId: string;
  messages: Array<Message>;
  isLoading: boolean;
  votes?: Array<Vote>;
  hasUserSentMessage?: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  isArtifactVisible?: boolean;
}

export function VirtualizedChat({ 
  chatId,
  messages,
  isLoading,
  votes = [],
  hasUserSentMessage = false,
  setMessages,
  reload,
  isReadonly,
  isArtifactVisible
}: VirtualizedChatProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { 
    shouldAutoScroll, 
    isStreaming, 
    handleScrollPositionChange,
    resetOnUserMessage,
    setIsStreaming
  } = useScrollStore();
  
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const isDeepSearchInProgress = useChatStore(state => state.isDeepSearchInProgress);
  
  // State to show thinking indicator immediately, even before server responds
  const [localThinking, setLocalThinking] = useState(false);
  
  // Update streaming state based on isLoading prop
  useEffect(() => {
    setIsStreaming(isLoading);
    
    if (isLoading) {
      setLocalThinking(true);
    } else {
      // Add a slight delay before hiding the indicator to prevent flickering
      const timer = setTimeout(() => setLocalThinking(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading, setIsStreaming]);
  
  // Reset scroll behavior when user sends a message
  useEffect(() => {
    if (hasUserSentMessage) {
      resetOnUserMessage();
      // Programmatically scroll to bottom when user sends a message
      if (virtuosoRef.current && messages.length > 0) {
        virtuosoRef.current.scrollToIndex({
          index: messages.length - 1,
          behavior: 'smooth',
          align: 'end'
        });
      }
    }
  }, [hasUserSentMessage, messages.length, resetOnUserMessage]);
  
  // Show thinking indicator for user messages or when explicitly loading
  const shouldShowThinking = (localThinking || isLoading || isDeepSearchInProgress) && 
    (messages.length === 0 || messages[messages.length - 1]?.role === 'user');
  
  // For messages near bottom, provide a threshold to make "isAtBottom" more forgiving
  const BOTTOM_THRESHOLD = 150; // pixels
  
  // Create empty state if no messages
  const EmptyPlaceholder = () => {
    return messages.length === 0 ? <Overview /> : null;
  };
  
  // Add thinking message to the end when needed
  const ThinkingItem = () => {
    if (!shouldShowThinking) return null;
    
    return (
      <div className="flex flex-col gap-2 px-4 md:px-6 w-full max-w-3xl mx-auto mb-0">
        <div className="flex justify-end">
          <div className="flex items-center gap-2 bg-background rounded-xl p-3 shadow-sm">
            <ThinkingMessage 
              message={deepSearchEnabled ? "Thinking & searching" : "Thinking"} 
              className="animate-pulse"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <EmptyPlaceholder />
      
      {messages.length > 0 && (
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', width: '100%' }}
          data={messages}
          className="flex flex-col min-w-0 gap-3 flex-1 overflow-y-auto h-full pt-3 pb-0"
          // Only follow output if shouldAutoScroll is true
          followOutput={shouldAutoScroll ? 'auto' : false}
          // Use smooth scrolling for better UX
          followOutputSmooth={true}
          // This is the key handler that updates our scroll state
          atBottomStateChange={(isAtBottom) => {
            handleScrollPositionChange(isAtBottom);
          }}
          // Add custom threshold to consider "near bottom" 
          atBottomThreshold={BOTTOM_THRESHOLD}
          // Make auto-scrolling smoother during streaming
          overscan={shouldAutoScroll && isStreaming ? 200 : 0}
          itemContent={(index, message) => (
            <PreviewMessage
              key={message.id}
              index={index}
              chatId={chatId}
              message={message}
              isLoading={isLoading && messages.length - 1 === index}
              vote={votes?.find((vote) => vote.messageId === message.id) || undefined}
              setMessages={setMessages}
              reload={reload}
              isReadonly={isReadonly}
            />
          )}
          components={{
            Footer: ThinkingItem
          }}
        />
      )}
    </>
  );
}