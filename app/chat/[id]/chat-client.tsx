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
    log.debug('[ChatClient Fetch Effect] Running', { chatId, isHydrated, hasFetchedMessages });

    // Wait for store hydration before fetching
    if (!isHydrated) {
      log.debug('[ChatClient Fetch Effect] Waiting for hydration...');
      return;
    }

    // Prevent fetch if already done for this ID or no ID
    if (hasFetchedMessages || !chatId) {
      log.debug('[ChatClient Fetch Effect] Skipping fetch', { hasFetchedMessages, chatIdExists: !!chatId });
      return;
    }

    async function fetchChatMessages() {
      // **Log right before fetch**
      log.debug('[ChatClient Fetch Effect] Proceeding to fetch messages...', { chatId });
      try {
        setIsLoading(true);
        log.debug('Fetching chat messages from API', { id: chatId });

        const response = await fetch(`/api/chat/${chatId}`);

        // --- BEGIN CLIENT DEBUG LOGGING ---
        const responseText = await response.text(); // Get raw text first
        log.debug(`[ChatClient] Received raw response text (length: ${responseText.length})`, {
          id: chatId,
          ok: response.ok,
          status: response.status,
          sample: responseText.substring(0, 500) // Log first 500 chars
        });
        // --- END CLIENT DEBUG LOGGING ---

        if (!response.ok) {
          // Use original status code from response
          if (response.status === 404) {
            throw new Error('Chat not found. It may have been deleted.');
          } else {
            // Try parsing error from body, otherwise use statusText
            let errorMsg = `Error fetching chat: ${response.statusText}`;
            try {
              const errorJson = JSON.parse(responseText); // Try parsing the text we already have
              errorMsg = errorJson.error || errorMsg;
            } catch (e) { /* Ignore parsing error */ }
            throw new Error(errorMsg);
          }
        }

        // Parse the raw text as JSON
        let parsedResponse: any;
        try {
          parsedResponse = JSON.parse(responseText);
        } catch (e) {
          log.error('[ChatClient] Failed to parse JSON response', { id: chatId, error: e, responseTextSample: responseText.substring(0, 500) });
          throw new Error('Failed to parse chat data from server.');
        }

        // --- Modification: Extract the nested 'data' object if it exists --- 
        const chatData = (parsedResponse && typeof parsedResponse === 'object' && parsedResponse.success === true && parsedResponse.data)
          ? parsedResponse.data
          : undefined; // Use undefined if structure is wrong
        // --- End modification ---

        // Check if we successfully extracted the chat data object
        if (!chatData) {
          log.error("[ChatClient] Parsed response missing expected 'data' property or success was false.", { chatId, parsedResponseType: typeof parsedResponse });
          throw new Error('Received invalid data structure from server.');
        }

        log.debug('[ChatClient] Successfully extracted chat data', {
          id: chatId,
          messageCount: chatData?.messages?.length ?? 'undefined' // Log count from the extracted data
        });

        // Mark that we've fetched messages for this chat AFTER successful extraction
        setHasFetchedMessages(true);

        // **Refined Logic: Use the extracted chatData**
        const currentConversations = useChatStore.getState().conversations;
        if (currentConversations[chatId]) {
          // Ensure messages array exists before accessing/updating
          const messagesToUpdate = chatData.messages || []; // Access messages directly from extracted chatData
          log.debug('Conversation exists in store, updating messages only', { id: chatId, messageCount: messagesToUpdate.length });
          // **Log the actual messages being sent to the store**
          log.debug('[ChatClient] Calling updateMessages with:', { chatId, messagesSample: JSON.stringify(messagesToUpdate.slice(0, 2)) });
          updateMessages(chatId, messagesToUpdate);
        } else {
          log.info('Conversation not found in store, creating based on fetched data', { id: chatId });
          // Ensure messages array exists before using
          const messagesToUpdate = chatData.messages || []; // Access messages directly from extracted chatData
          useChatStore.setState((state) => ({
            conversations: {
              ...state.conversations,
              [chatId]: {
                id: chatId,
                messages: messagesToUpdate, // Use fetched messages (or empty array)
                createdAt: chatData.createdAt || new Date().toISOString(),
                updatedAt: chatData.updatedAt || new Date().toISOString(),
                title: chatData.title || 'New Chat',
                agentId: chatData.agentId || state.selectedAgentId,
                deepSearchEnabled: chatData.deepSearchEnabled || state.deepSearchEnabled,
              },
            },
            currentConversationId: chatId,
          }));
        }

        // Ensure the current conversation ID is set correctly in the store
        // (might be redundant if the above logic handles it, but safe to ensure)
        if (useChatStore.getState().currentConversationId !== chatId) {
          setCurrentConversation(chatId);
        }

        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        log.error('Error fetching chat', { id: chatId, error: errorMessage });
        setError(errorMessage);
        setIsLoading(false);
      }
    }

    fetchChatMessages();

    // ** Refined Dependency Array **
    // Primarily depends on chatId and hydration status.
    // Actions like setCurrentConversation/updateMessages are stable.
  }, [chatId, isHydrated, hasFetchedMessages, setCurrentConversation, updateMessages]);

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
        <button
          onClick={() => window.location.href = '/chat'}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Return to New Chat
        </button>
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
    return <div className="h-screen flex items-center justify-center">Chat not found or failed to load properly.</div>;
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