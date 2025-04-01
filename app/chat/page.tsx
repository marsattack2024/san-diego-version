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

export default function ChatPage() {
  const isHydrated = useChatStore(state => state.isHydrated);
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const conversations = useChatStore(state => state.conversations);
  const createConversation = useChatStore(state => state.createConversation);
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);

      const data = await historyService.fetchHistory(false);

      setHistory(data || []);
    } catch (error) {
      log.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      log.debug('Waiting for store hydration before fetching history');
      return;
    }

    log.debug('Store hydrated, fetching history');
    fetchHistory();
  }, [fetchHistory, isHydrated]);

  useEffect(() => {
    if (historyLoading || !isHydrated) return;

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isNewChat = urlParams.get('new') === 'true';
      const timestamp = urlParams.get('t');

      if (isNewChat) {
        log.debug('Creating new chat from URL parameter', { timestamp });

        useChatStore.setState({
          currentConversationId: null
        });

        createConversation();

        window.history.replaceState({}, '', '/chat');
        setIsInitialized(true);
      } else if (!currentConversationId) {
        if (history && history.length > 0) {
          const mostRecentChat = history[0];
          log.debug('Loading most recent chat from history', { id: mostRecentChat.id });

          router.push(`/chat/${mostRecentChat.id}`);
        } else {
          log.debug('No chat history found, creating a new one');
          createConversation();
          setIsInitialized(true);
        }
      } else {
        log.debug('Using existing conversation', { id: currentConversationId });
        setIsInitialized(true);
      }
    }
  }, [currentConversationId, createConversation, history, historyLoading, router, isHydrated]);

  const currentConversation = currentConversationId
    ? conversations[currentConversationId]
    : null;

  if (historyLoading || !isHydrated || !isInitialized || (!currentConversationId && !currentConversation)) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

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