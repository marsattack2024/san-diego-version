'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { historyService } from '@/lib/api/history-service';
import { Chat } from '@/components/chat';
import { Chat as ChatType } from '@/lib/db/schema';
import { clientLogger } from '@/lib/logger/client-logger';
import { edgeLogger as log } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createClient } from '@/utils/supabase/client';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  const isHydrated = useChatStore(state => state.isHydrated);
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const conversations = useChatStore(state => state.conversations);
  const loadedConversations = useChatStore(state => state.loadedConversations);
  const createConversation = useChatStore(state => state.createConversation);
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);

      const supabase = createClient();

      const data = await historyService.fetchHistory(supabase, false);

      setHistory(data || []);
    } catch (error) {
      log.error('Error fetching history:', {
        error: error instanceof Error ? error.message : String(error)
      });
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
      const timestamp = urlParams.get('t') || '';

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

  const currentLoadedConversation = currentConversationId
    ? loadedConversations[currentConversationId]
    : null;

  if (historyLoading || !isHydrated || !isInitialized || !currentConversationId || !currentLoadedConversation) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  log.debug('Rendering chat with loaded conversation', {
    id: currentConversationId,
    messageCount: currentLoadedConversation.messages?.length || 0
  });

  return (
    <Chat
      id={currentConversationId!}
      initialMessages={currentLoadedConversation.messages || []}
      isReadonly={false}
    />
  );
} 