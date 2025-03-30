'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ChatRequestOptions, Message } from 'ai';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { PreviewMessage, ThinkingMessage } from './message';
import type { Vote } from '@/lib/db/schema';
import { useChatStore } from '@/stores/chat-store';
import { Overview } from './overview';
import { virtuosoConfig, BOTTOM_THRESHOLD } from '@/lib/virtualization-config'; // Import the virtuoso config
import { styles } from '@/lib/tokens'; // Import styles from token system
import { CustomScrollArea } from './ui/custom-scroll-area'; // Import custom scroll area

export interface VirtualizedChatProps {
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

  // Deep search state
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const isDeepSearchInProgress = useChatStore(state => state.isDeepSearchInProgress);

  // Thinking state - local implementation
  const [localThinking, setLocalThinking] = useState(false);

  // Auto-scroll state
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);

  // Monitor streaming state based on isLoading
  useEffect(() => {
    if (isLoading) {
      setIsStreaming(true);
      setLocalThinking(true);
    } else {
      // Add a small delay to ensure smooth auto-scrolling completes
      const timeout = setTimeout(() => {
        setIsStreaming(false);
        setLocalThinking(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  // Handle scroll position changes
  const handleScrollPositionChange = (isAtBottom: boolean) => {
    setShouldAutoScroll(isAtBottom);
  };

  // Reset thinking state when user sends message
  const resetOnUserMessage = () => {
    setLocalThinking(false);
  };

  // Handle user message effects
  useEffect(() => {
    if (hasUserSentMessage) {
      resetOnUserMessage();
      // Programmatically scroll to bottom when user sends a message
      if (virtuosoRef.current && messages.length > 0) {
        virtuosoRef.current.scrollToIndex({
          index: messages.length - 1,
          behavior: 'smooth',
          align: 'end',
        });
      }
    }
  }, [hasUserSentMessage, messages.length]);

  // Show thinking indicator for user messages or when explicitly loading
  const shouldShowThinking = (localThinking || isLoading || isDeepSearchInProgress) &&
    (messages.length === 0 || messages[messages.length - 1]?.role === 'user');

  // Create empty state if no messages
  const EmptyPlaceholder = () => {
    return messages.length === 0 ? <Overview /> : null;
  };

  // Add thinking message to the end when needed
  const ThinkingItem = () => {
    if (!shouldShowThinking) return null;

    return (
      <div className="flex flex-col gap-3 px-4 md:px-6 w-full max-w-3xl mx-auto mb-3">
        <div className="flex justify-end">
          <div className="flex items-center gap-3 bg-card rounded-xl p-3 shadow-sm border border-border/30 animate-pulse-subtle">
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
    <CustomScrollArea className="h-full w-full flex-1 flex flex-col overflow-hidden" hideScrollbar>
      <EmptyPlaceholder />

      {messages.length > 0 && (
        <Virtuoso
          ref={virtuosoRef}
          style={{
            ...virtuosoConfig.style,
            flex: 1,
            height: '100%',
            minHeight: 'calc(100vh - 14rem)' // Add minimum height to ensure messages area is visible
          } as React.CSSProperties}
          data={messages}
          className={styles.virtualizedChat}
          initialTopMostItemIndex={messages.length - 1}
          alignToBottom={true}
          defaultItemHeight={virtuosoConfig.defaultItemHeight}
          followOutput={shouldAutoScroll ? 'auto' : false}
          atBottomStateChange={(isAtBottom) => {
            handleScrollPositionChange(isAtBottom);
          }}
          atBottomThreshold={BOTTOM_THRESHOLD}
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
    </CustomScrollArea>
  );
}