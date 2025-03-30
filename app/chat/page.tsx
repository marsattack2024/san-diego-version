'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { historyService } from '@/lib/api/history-service';
import { Chat } from '@/components/chat';
import { Chat as ChatType } from '@/lib/db/schema';
import { clientLogger } from '@/lib/logger/client-logger';

export const dynamic = 'force-dynamic';

const log = clientLogger;

// Track whether we've completed an initial store hydration
let storeHydrated = false;

export default function ChatPage() {
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const conversations = useChatStore(state => state.conversations);
  const createConversation = useChatStore(state => state.createConversation);
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // Add state for tracking hydration
  const [isStoreReady, setIsStoreReady] = useState(storeHydrated);

  // Handle store hydration status
  useEffect(() => {
    // If store is already known to be hydrated, we're ready
    if (storeHydrated) {
      setIsStoreReady(true);
      console.debug('[ChatStore] Store already hydrated');
      return;
    }

    // Otherwise, wait a moment and check for persisted state
    // This gives Zustand persist middleware time to hydrate
    const timer = setTimeout(() => {
      storeHydrated = true;
      setIsStoreReady(true);
      log.debug('[ChatStore] Hydration check completed');
    }, 150); // Increased from 100ms to give more time for hydration

    return () => clearTimeout(timer);
  }, []);

  // Optimized history fetching using the history service
  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      // Use data-only refresh to avoid navigation race conditions
      await useChatStore.getState().refreshHistoryData();
      // Get latest history from store for rendering
      const historyData = Object.values(useChatStore.getState().conversations).map(conv => ({
        id: conv.id,
        title: conv.title || '',
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        userId: conv.userId || ''
      } as ChatType));
      setHistory(historyData);
    } catch (error) {
      log.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch history on component mount
  useEffect(() => {
    // Only fetch if store is hydrated
    if (!isStoreReady) {
      log.debug('Waiting for store hydration before fetching history');
      return;
    }

    fetchHistory();
  }, [fetchHistory, isStoreReady]);

  // Check for a newChat parameter which forces creation of a new chat
  useEffect(() => {
    // Wait for both store and history to be ready
    if (historyLoading || !isStoreReady) return;

    // Check if the URL contains the newChat parameter and timestamp
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isNewChat = urlParams.get('new') === 'true';
      const timestamp = urlParams.get('t');

      if (isNewChat) {
        // Force creation of a new chat and clear existing conversation
        log.debug('Creating new chat from URL parameter', { timestamp });

        // Clear existing conversation state first to ensure full refresh
        useChatStore.setState({
          currentConversationId: null
        });

        // Create a new conversation
        createConversation();

        // Remove the query parameter from the URL
        window.history.replaceState({}, '', '/chat');
        setIsInitialized(true);
      } else if (!currentConversationId) {
        // If no current conversation, always try to load the most recent one from history
        if (history && history.length > 0) {
          const mostRecentChat = history[0]; // History is sorted by updated_at desc
          log.debug('Loading most recent chat from history', { id: mostRecentChat.id });

          // Redirect to the specific chat page
          router.push(`/chat/${mostRecentChat.id}`);
        } else {
          // Only create a new conversation if there's absolutely no history
          log.debug('No chat history found, creating a new one');
          createConversation();
          setIsInitialized(true);
        }
      } else {
        log.debug('Using existing conversation', { id: currentConversationId });
        setIsInitialized(true);
      }
    }
  }, [currentConversationId, createConversation, history, historyLoading, router, isStoreReady]);

  // Get current conversation
  const currentConversation = currentConversationId
    ? conversations[currentConversationId]
    : null;

  // If no conversation exists yet or we're still loading, show loading state
  if (historyLoading || !isStoreReady || !isInitialized || (!currentConversationId && !currentConversation)) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  // Reduce log verbosity in development
  log.debug('Rendering chat with conversation', {
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