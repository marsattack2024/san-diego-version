'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatRequestOptions, Message } from 'ai';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { PreviewMessage, ThinkingMessage } from './message';
import type { Vote } from '@/lib/db/schema';
import { useChatStore } from '@/stores/chat-store';
import { Overview } from './overview';
import { virtuosoConfig, BOTTOM_THRESHOLD } from '@/lib/virtualization-config'; // Import the virtuoso config
import { styles } from '@/lib/tokens'; // Import styles from token system
import { CustomScrollArea } from './ui/custom-scroll-area'; // Import custom scroll area
import { Loader } from 'lucide-react';

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

  // Lazy loading state
  const [allMessages, setAllMessages] = useState<Message[]>(messages || []);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false); // Start with false by default
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState<number | null>(null);
  const pageSize = 20; // Number of messages to load per batch

  // Update allMessages when messages prop changes
  useEffect(() => {
    setAllMessages(messages);
  }, [messages]);

  // Fetch total message count on initial load
  useEffect(() => {
    async function fetchTotalMessageCount() {
      if (!chatId) return;

      try {
        const response = await fetch(`/api/chat/${chatId}/messages/count`);
        if (response.ok) {
          const { count } = await response.json();
          setTotalMessageCount(count);

          // Determine if there are more messages to load
          setHasMore(count > allMessages.length);
        }
      } catch (error) {
        console.error('Error fetching message count:', error);
      }
    }

    fetchTotalMessageCount();
  }, [chatId, allMessages.length]);

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

  // Handler for when user scrolls to top - load more messages
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore || !chatId) return;

    setIsLoadingMore(true);

    try {
      // Call API to fetch previous page of messages
      const response = await fetch(`/api/chat/${chatId}/messages?page=${page + 1}&pageSize=${pageSize}`);

      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }

      const olderMessages = await response.json();

      // Check if we've reached the end of available messages
      if (!olderMessages || olderMessages.length === 0) {
        setHasMore(false);
        setIsLoadingMore(false);
        return;
      }

      // Prepend older messages to current messages
      setAllMessages(prev => [...olderMessages, ...prev]);
      setPage(prev => prev + 1);

      // If we received fewer messages than requested, we've reached the end
      if (olderMessages.length < pageSize) {
        setHasMore(false);
      }

      // Check against total count after loading
      if (totalMessageCount !== null && allMessages.length + olderMessages.length >= totalMessageCount) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      // Show error toast or some other user feedback
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, hasMore, isLoadingMore, page, pageSize, totalMessageCount, allMessages.length]);

  // Handle user message effects
  useEffect(() => {
    if (hasUserSentMessage) {
      resetOnUserMessage();
      // Programmatically scroll to bottom when user sends a message
      if (virtuosoRef.current && allMessages.length > 0) {
        virtuosoRef.current.scrollToIndex({
          index: allMessages.length - 1,
          behavior: 'smooth',
          align: 'end',
        });
      }
    }
  }, [hasUserSentMessage, allMessages.length]);

  // Show thinking indicator for user messages or when explicitly loading
  const shouldShowThinking = (localThinking || isLoading || isDeepSearchInProgress) &&
    (allMessages.length === 0 || allMessages[allMessages.length - 1]?.role === 'user');

  // Create empty state if no messages
  const EmptyPlaceholder = () => {
    return allMessages.length === 0 ? <Overview /> : null;
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

  // Loading header for older messages
  const LoadingHeader = () => {
    // Only show the header if:
    // 1. We're currently loading more messages, OR
    // 2. We know there are more messages to load based on the total count
    if (isLoadingMore) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground justify-center py-4">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading older messages...</span>
        </div>
      );
    }

    // Only show "Scroll up" if we know there are more messages to load
    if (hasMore && totalMessageCount !== null && allMessages.length < totalMessageCount) {
      return (
        <div className="flex justify-center items-center py-4 w-full">
          <div className="text-sm text-muted-foreground">Scroll up to load more</div>
        </div>
      );
    }

    return null;
  };

  return (
    <CustomScrollArea className="h-full w-full flex-1 flex flex-col overflow-hidden" hideScrollbar>
      <EmptyPlaceholder />

      {allMessages.length > 0 && (
        <Virtuoso
          ref={virtuosoRef}
          style={{
            ...virtuosoConfig.style,
            flex: 1,
            height: '100%',
            minHeight: 'calc(100vh - 14rem)', // Add minimum height to ensure messages area is visible
            paddingBottom: '120px' // Add padding at the bottom to ensure last message is fully visible
          } as React.CSSProperties}
          data={allMessages}
          className={styles.virtualizedChat}
          initialTopMostItemIndex={allMessages.length - 1}
          alignToBottom={true}
          defaultItemHeight={virtuosoConfig.defaultItemHeight}
          followOutput={shouldAutoScroll ? 'auto' : false}
          startReached={loadMoreMessages}
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
              isLoading={isLoading && allMessages.length - 1 === index}
              vote={votes?.find((vote) => vote.messageId === message.id) || undefined}
              setMessages={setMessages}
              reload={reload}
              isReadonly={isReadonly}
            />
          )}
          components={{
            Header: LoadingHeader,
            Footer: ThinkingItem
          }}
        />
      )}
    </CustomScrollArea>
  );
}