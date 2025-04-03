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
  const { conversations, setCurrentConversation, updateMessages } = useChatStore();
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

  // Fetch the chat messages from the API
  useEffect(() => {
    // **Log state at effect start**
    log.debug('[ChatClient Fetch Effect] Running', {
      chatId,
      isHydrated,
      hasFetchedMessages,
      storeConversation: conversations[chatId] ? {
        id: conversations[chatId].id,
        messageCount: conversations[chatId].messages?.length || 0
      } : 'not found'
    });

    // Wait for store hydration before fetching
    if (!isHydrated) {
      log.debug('[ChatClient Fetch Effect] Waiting for hydration...');
      return;
    }

    // Prevent fetch if already done for this ID or no ID
    if (hasFetchedMessages || !chatId) {
      log.debug('[ChatClient Fetch Effect] Skipping fetch', { hasFetchedMessages, chatIdExists: !!chatId });
      setIsLoading(false);
      return;
    }

    // Make sure to set loading state first
    setIsLoading(true);
    setError(null);

    async function fetchChatMessages() {
      const operationId = `fetch_${Math.random().toString(36).substring(2, 8)}`;
      log.debug(`[ChatClient] Starting fetch operation ${operationId}`, {
        chatId,
        url: `/api/chat/${chatId}?_=${Date.now()}`
      });

      try {
        // Try direct API first with cache busting
        const response = await fetch(`/api/chat/${chatId}?_=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          credentials: 'same-origin' // Include cookies for authentication
        });

        if (!response.ok) {
          const errorText = await response.text();
          log.error(`[ChatClient:${operationId}] API error ${response.status}`, {
            status: response.status,
            error: errorText.substring(0, 200)
          });
          throw new Error(`Error ${response.status}: ${errorText}`);
        }

        // Log raw response to debug
        const rawResponse = await response.text();
        log.debug(`[ChatClient:${operationId}] Raw API response (first 200 chars)`, {
          responseLength: rawResponse.length,
          sampleText: rawResponse.substring(0, 200)
        });

        // Parse response carefully
        let data;
        try {
          data = JSON.parse(rawResponse);
          log.debug(`[ChatClient:${operationId}] Parsed JSON successfully`, {
            hasData: !!data,
            hasSuccess: data?.success === true,
            hasMessages: Array.isArray(data?.messages) || Array.isArray(data?.data?.messages),
            dataKeys: Object.keys(data || {})
          });
        } catch (parseError) {
          log.error(`[ChatClient:${operationId}] JSON parse error`, {
            error: parseError instanceof Error ? parseError.message : String(parseError),
            rawSample: rawResponse.substring(0, 100)
          });
          throw new Error('Failed to parse API response');
        }

        // Extract content - either directly from data or from data.data if using response wrapper
        const chatData = data.success && data.data ? data.data : data;

        // Check for valid chat data with required fields
        if (!chatData || !chatData.id) {
          log.error(`[ChatClient:${operationId}] Invalid chat data structure`, {
            hasData: !!chatData,
            dataKeys: chatData ? Object.keys(chatData) : [],
            success: data?.success
          });
          throw new Error('Invalid chat data received');
        }

        // Detailed logging about the received data
        log.debug(`[ChatClient:${operationId}] Received valid chat data`, {
          id: chatData.id,
          title: chatData.title || 'Untitled',
          hasMessages: Array.isArray(chatData.messages),
          messageCount: Array.isArray(chatData.messages) ? chatData.messages.length : 0,
          firstMessageSample: chatData.messages && chatData.messages.length > 0
            ? `${chatData.messages[0].role}: ${chatData.messages[0].content.substring(0, 50)}...`
            : 'No messages'
        });

        // Create a complete conversation object for the store
        const conversation = {
          id: chatId,
          messages: Array.isArray(chatData.messages) ? chatData.messages : [],
          createdAt: chatData.createdAt || new Date().toISOString(),
          updatedAt: chatData.updatedAt || new Date().toISOString(),
          title: chatData.title || 'New Chat',
          agentId: chatData.agentId || useChatStore.getState().selectedAgentId,
          deepSearchEnabled: chatData.deepSearchEnabled || false
        };

        // Update the store with the complete conversation
        log.debug(`[ChatClient:${operationId}] Updating store with conversation`, {
          id: chatId,
          messageCount: conversation.messages.length,
          title: conversation.title
        });

        // Update the store in a single operation
        useChatStore.setState(state => ({
          conversations: {
            ...state.conversations,
            [chatId]: conversation
          },
          currentConversationId: chatId
        }));

        // Manually verify the store was updated correctly
        const postUpdateState = useChatStore.getState();
        log.debug(`[ChatClient:${operationId}] Store update verification`, {
          conversationExists: !!postUpdateState.conversations[chatId],
          messageCount: postUpdateState.conversations[chatId]?.messages?.length || 0,
          currentId: postUpdateState.currentConversationId
        });

        // Mark that we've fetched messages and we're done loading
        setHasFetchedMessages(true);
        setIsLoading(false);

        log.debug(`[ChatClient:${operationId}] Fetch completed successfully`);
      } catch (error) {
        log.error(`[ChatClient:${operationId}] Error fetching chat`, {
          id: chatId,
          error: error instanceof Error ? error.message : String(error)
        });
        setError(error instanceof Error ? error.message : 'Failed to load chat data');
        setIsLoading(false);

        // Allow retry if there was a network error
        setHasFetchedMessages(false);
      }
    }

    fetchChatMessages();
  }, [chatId, isHydrated, hasFetchedMessages, conversations]);

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

  // Get the conversation from the store
  const currentConversation = conversations[chatId];

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

  // Add a refresh button if messages array is empty
  if (messagesToPass.length === 0 && !isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="text-gray-700 mb-4">This chat exists but has no messages.</div>
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

  return (
    <Chat
      key={chatId}
      id={chatId}
      initialMessages={messagesToPass} // Pass the guaranteed array
      isReadonly={false}
    />
  );
} 