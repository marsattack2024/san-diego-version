'use client';

import { Chat } from '@/components/chat';
import { useChatStore } from '@/stores/chat-store';
import { useEffect, useState } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

const log = clientLogger;

interface ChatClientProps {
  chatId: string;
}

// Remove the global hydration tracking
export function ChatClient({ chatId }: ChatClientProps) {
  const {
    setCurrentConversation,
    getConversation,
    ensureConversationLoaded,
    isConversationLoaded
  } = useChatStore();

  // Use isHydrated from store directly
  const isHydrated = useChatStore(state => state.isHydrated);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep track of whether we've already fetched messages for this chat
  const [hasFetchedMessages, setHasFetchedMessages] = useState(false);

  // Reset hasFetchedMessages when chatId changes
  useEffect(() => {
    setHasFetchedMessages(false);
  }, [chatId]);

  // Prioritize URL parameter by setting current conversation immediately
  useEffect(() => {
    if (!isHydrated || !chatId) return;

    // Explicitly set the current conversation to match URL
    setCurrentConversation(chatId);
    log.debug('Setting current conversation from URL', { id: chatId });
  }, [chatId, isHydrated, setCurrentConversation]);

  // Fetch the chat messages from API if needed
  useEffect(() => {
    // Get the latest conversation directly from the store
    const conversationLoaded = isConversationLoaded(chatId);
    const conversation = getConversation(chatId);

    // Log state at effect start
    log.debug('[ChatClient Fetch Effect] Running', {
      chatId,
      isHydrated,
      hasFetchedMessages,
      conversationLoaded,
      messageCount: conversation?.messages?.length || 0
    });

    // Wait for store hydration before fetching
    if (!isHydrated) {
      log.debug('[ChatClient Fetch Effect] Waiting for hydration...');
      return;
    }

    // Prevent fetch if already done for this ID or no ID
    if (hasFetchedMessages || !chatId) {
      log.debug('[ChatClient Fetch Effect] Skipping fetch', {
        hasFetchedMessages,
        chatIdExists: !!chatId
      });
      setIsLoading(false);
      return;
    }

    // Make sure to set loading state first
    setIsLoading(true);
    setError(null);

    async function loadConversation() {
      const operationId = `load_${Math.random().toString(36).substring(2, 8)}`;
      log.debug(`[ChatClient] Starting load operation ${operationId}`, { chatId });

      try {
        // Use the store's ensureConversationLoaded method
        const result = await ensureConversationLoaded(chatId);

        if (!result) {
          throw new Error('Failed to load conversation');
        }

        log.debug(`[ChatClient:${operationId}] Successfully loaded conversation`, {
          id: result.id,
          title: result.title,
          messageCount: result.messages.length
        });

        // Mark as fetched and update UI state
        setHasFetchedMessages(true);
        setIsLoading(false);
      } catch (error) {
        log.error(`[ChatClient:${operationId}] Error loading chat`, {
          id: chatId,
          error: error instanceof Error ? error.message : String(error)
        });
        setError(error instanceof Error ? error.message : 'Failed to load chat data');
        setIsLoading(false);

        // Allow retry
        setHasFetchedMessages(false);
      }
    }

    loadConversation();
  }, [chatId, isHydrated, hasFetchedMessages, getConversation, ensureConversationLoaded, isConversationLoaded]);

  // Show loading state while store is being hydrated
  if (!isHydrated) {
    return <div className="h-screen flex items-center justify-center">Preparing chat...</div>;
  }

  // Show loading or error state if needed
  if (isLoading) {
    return <div className="h-screen flex items-center justify-center">Loading chat...</div>;
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-center p-4">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <div className="flex gap-4">
          <button
            onClick={() => {
              setHasFetchedMessages(false);
              setError(null);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry Loading Chat
          </button>
          <button
            onClick={() => window.location.href = '/chat'}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Return to New Chat
          </button>
        </div>
      </div>
    );
  }

  // Get the conversation directly from the store
  const currentConversation = getConversation(chatId);

  // Ensure initialMessages is always an array, even if conversation/messages are temporarily undefined
  const messagesToPass = currentConversation?.messages || [];

  // Add logging for what's being passed
  log.debug('[ChatClient] Rendering Chat component', {
    chatId,
    conversationExists: !!currentConversation,
    messagesInStoreCount: currentConversation?.messages?.length ?? 'undefined',
    messagesPassedToChatCount: messagesToPass.length
  });

  // Check if conversation is truly missing after loading
  if (!isLoading && !error && !currentConversation) {
    log.warn('[ChatClient] Conversation object missing from store after loading finished', { chatId });
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="text-gray-700 mb-4">Chat not found or failed to load properly.</div>
        <div className="flex gap-4">
          <button
            onClick={() => {
              setHasFetchedMessages(false);
              setError(null);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry Loading Chat
          </button>
          <button
            onClick={() => window.location.href = '/chat'}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Return to New Chat
          </button>
        </div>
      </div>
    );
  }

  return <Chat id={chatId} initialMessages={messagesToPass} isReadonly={false} />;
} 