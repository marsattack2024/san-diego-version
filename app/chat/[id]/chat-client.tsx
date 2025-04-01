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

  // Prioritize URL parameter by setting current conversation immediately
  useEffect(() => {
    if (!isHydrated || !chatId) return;

    // Explicitly set the current conversation to match URL
    setCurrentConversation(chatId);
    log.debug('Setting current conversation from URL', { id: chatId });
  }, [chatId, isHydrated, setCurrentConversation]);

  // Fetch the chat messages from the API
  useEffect(() => {
    // Wait for store hydration before fetching
    if (!isHydrated) {
      log.debug('Waiting for store hydration before fetching messages');
      return;
    }

    // Prevent infinite loop by only fetching once per chat ID
    if (hasFetchedMessages || !chatId) return;

    async function fetchChatMessages() {
      try {
        setIsLoading(true);
        log.debug('Fetching chat messages from API', { id: chatId });

        const response = await fetch(`/api/chat/${chatId}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Chat not found. It may have been deleted.');
          } else {
            throw new Error(`Error fetching chat: ${response.statusText}`);
          }
        }

        const chatData = await response.json();
        log.debug('Successfully fetched chat data', {
          id: chatId,
          messageCount: chatData.messages?.length || 0
        });

        // Mark that we've fetched messages for this chat
        setHasFetchedMessages(true);

        // Convert messages to the format expected by the chat component
        const messages = chatData.messages?.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt
        })) || [];

        // Update the chat store with fetched messages
        if (messages.length > 0) {
          // First, ensure the conversation exists in the store
          if (!conversations[chatId]) {
            // If the conversation doesn't exist in the store, create a new one with the same ID
            log.info('Creating conversation in store for existing chat', { id: chatId });

            useChatStore.setState((state) => ({
              conversations: {
                ...state.conversations,
                [chatId]: {
                  id: chatId,
                  messages: [],
                  createdAt: chatData.createdAt || new Date().toISOString(),
                  updatedAt: chatData.updatedAt || new Date().toISOString(),
                  title: chatData.title,
                  agentId: chatData.agentId || state.selectedAgentId,
                  deepSearchEnabled: chatData.deepSearchEnabled || state.deepSearchEnabled,
                },
              },
              currentConversationId: chatId,
            }));
          }

          // Update the messages in the store
          updateMessages(chatId, messages);
        }

        // If no messages were found but the chat ID exists, create an empty conversation
        else {
          log.info('No messages found, creating empty conversation', { id: chatId });

          const timestamp = new Date().toISOString();
          const selectedAgentId = useChatStore.getState().selectedAgentId;

          useChatStore.setState((state) => ({
            conversations: {
              ...state.conversations,
              [chatId]: {
                id: chatId,
                messages: [],
                createdAt: timestamp,
                updatedAt: timestamp,
                title: 'New Chat',
                agentId: selectedAgentId,
                deepSearchEnabled: state.deepSearchEnabled,
              },
            },
            currentConversationId: chatId,
          }));
        }

        // Set as current conversation
        setCurrentConversation(chatId);
        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        log.error('Error fetching chat', { id: chatId, error: errorMessage });
        setError(errorMessage);
        setIsLoading(false);
      }
    }

    fetchChatMessages();
  }, [chatId, conversations, setCurrentConversation, updateMessages, hasFetchedMessages, isHydrated]);

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

  if (!currentConversation) {
    return <div className="h-screen flex items-center justify-center">Chat not found</div>;
  }

  return (
    <Chat
      id={chatId}
      initialMessages={currentConversation.messages}
      isReadonly={false}
    />
  );
} 