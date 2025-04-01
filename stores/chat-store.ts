import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Message } from 'ai';
import { type AgentType } from '@/lib/chat-engine/prompts';
import { historyService } from '@/lib/api/history-service';
import { Chat } from '@/lib/db/schema';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { shallow } from 'zustand/shallow';

// Define a more comprehensive conversation type for Supabase integration
export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  title?: string;
  userId?: string; // For Supabase auth integration
  agentId: AgentType; // Track which agent was used
  metadata?: Record<string, any>; // For additional data like settings
  deepSearchEnabled?: boolean; // Track if DeepSearch is enabled for this conversation
}

// Define previous state versions for migrations
interface ChatStateV0 {
  conversations: Record<string, {
    id: string;
    messages: Message[];
    createdAt: string;
    title?: string;
  }>;
  currentConversationId: string | null;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  currentConversationId: string | null;
  selectedAgentId: AgentType;
  deepSearchEnabled: boolean;
  isDeepSearchInProgress: boolean; // Track when deep search is actively running

  // New state properties for history synchronization
  isLoadingHistory: boolean; // Tracks when history is loading
  historyError: string | null; // Stores any history loading errors
  lastHistoryFetch: number | null; // Timestamp of last history fetch
  // Add hydration tracking
  isHydrated: boolean; // Tracks when the store has been hydrated

  // Actions
  createConversation: () => string;
  setCurrentConversation: (id: string) => void;
  getConversation: (id: string) => Conversation | undefined;
  addMessage: (message: Message) => void;
  updateMessages: (conversationId: string, messages: Message[]) => void;
  clearConversation: () => void;
  ensureMessageIds: (messages: Message[]) => Message[];
  updateConversationMetadata: (conversationId: string, metadata: Partial<Conversation>) => void;
  deleteConversation: (conversationId: string) => void;
  setDeepSearchEnabled: (enabled: boolean) => void;
  getDeepSearchEnabled: () => boolean;
  setSelectedAgent: (agentId: AgentType) => void;
  getSelectedAgent: () => AgentType;
  setDeepSearchInProgress: (inProgress: boolean) => void; // Set deep search progress state
  isAnySearchInProgress: () => boolean; // Check if either regular loading or deep search is happening

  // New synchronization methods
  fetchHistory: (forceRefresh?: boolean) => Promise<void>;
  syncConversationsFromHistory: (historyData: Chat[]) => void;
  updateConversationTitle: (id: string, title: string) => void;
  removeConversationOptimistic: (id: string) => void;

  // Refresh history data without changing current conversation ID
  refreshHistoryData: () => Promise<void>;
}

// Custom storage with debug logging
const createDebugStorage = (options?: { enabled?: boolean }): StateStorage => {
  const isDebugEnabled = options?.enabled ?? process.env.NODE_ENV !== 'production';

  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';

  return {
    getItem: (name: string): string | null => {
      // Return null during SSR
      if (!isBrowser) {
        return null;
      }

      const value = localStorage.getItem(name);
      if (isDebugEnabled) {
        console.debug(`[ChatStore] Loading from storage: ${name.substring(0, 20)}...`);
      }
      return value;
    },
    setItem: (name: string, value: string): void => {
      // Do nothing during SSR
      if (!isBrowser) {
        return;
      }

      if (isDebugEnabled) {
        console.debug(`[ChatStore] Saving to storage: ${name.substring(0, 20)}...`);
      }
      localStorage.setItem(name, value);
    },
    removeItem: (name: string): void => {
      // Do nothing during SSR
      if (!isBrowser) {
        return;
      }

      if (isDebugEnabled) {
        console.debug(`[ChatStore] Removing from storage: ${name.substring(0, 20)}...`);
      }
      localStorage.removeItem(name);
    },
  };
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      currentConversationId: null,
      selectedAgentId: 'default' as AgentType,
      deepSearchEnabled: false,
      isDeepSearchInProgress: false,

      // Initialize new state properties
      isLoadingHistory: false,
      historyError: null,
      lastHistoryFetch: null,
      // Add hydration flag initializer
      isHydrated: false,

      // New method to synchronize conversations from history data
      syncConversationsFromHistory: (historyData: Chat[]) => {
        console.log('[ChatStore] Starting syncConversationsFromHistory with', historyData.length, 'items');
        console.time('[ChatStore] conversion to map');

        // Convert array to map for faster access
        const conversationsMap: Record<string, Conversation> = {};

        let index = 0;
        for (const chat of historyData) {
          if (index === 0 || index === historyData.length - 1 || index % 10 === 0) {
            console.log(`[ChatStore] Processing history item ${index}/${historyData.length}`);
          }

          // Ensure chat has all required fields
          if (!chat || !chat.id) {
            console.warn('[ChatStore] Skipping invalid chat object:', chat);
            index++;
            continue;
          }

          try {
            conversationsMap[chat.id] = {
              id: chat.id,
              messages: chat.messages || [],
              createdAt: chat.createdAt || new Date().toISOString(),
              updatedAt: chat.updatedAt || new Date().toISOString(),
              title: chat.title || 'Untitled',
              agentId: ((chat as any).agentId as AgentType) || 'default',
              deepSearchEnabled: (chat as any).deepSearchEnabled || false,
              userId: chat.userId
            };
          } catch (error) {
            console.error('[ChatStore] Error processing chat item:', error, chat);
          }

          index++;
        }

        console.timeEnd('[ChatStore] conversion to map');
        console.log('[ChatStore] Finished converting history to map, updating state with', Object.keys(conversationsMap).length, 'conversations');

        try {
          console.time('[ChatStore] state update');
          set({ conversations: conversationsMap });
          console.timeEnd('[ChatStore] state update');
          console.log('[ChatStore] State updated successfully');
        } catch (error) {
          console.error('[ChatStore] Error updating state with conversations:', error);
        }

        console.debug(`[ChatStore] Synchronized ${historyData.length} conversations from history`);
      },

      // New method to fetch history from API
      fetchHistory: async (forceRefresh = false) => {
        const state = get();

        console.log('[ChatStore] Starting fetchHistory with state:', {
          isLoadingHistory: state.isLoadingHistory,
          forceRefresh,
          historyError: state.historyError,
          conversationCount: Object.keys(state.conversations).length
        });

        // BYPASS AUTH FAILURE CIRCUIT BREAKER FOR NOW
        // This will force history fetch regardless of previous failures
        if (historyService.isInAuthFailure()) {
          console.debug('[ChatStore] Bypassing auth failure circuit breaker to force history refresh');
          historyService.resetAuthFailure();
        }

        // Prevent multiple concurrent fetches unless forced
        if (state.isLoadingHistory && !forceRefresh) {
          console.debug(`[ChatStore] History fetch already in progress, skipping`);
          return;
        }

        // Implement adaptive refresh timing - only refresh if needed
        const now = Date.now();
        const timeSinceLastFetch = state.lastHistoryFetch ? now - state.lastHistoryFetch : Infinity;
        const minRefreshInterval = 30 * 1000; // 30 seconds between refreshes

        if (!forceRefresh && timeSinceLastFetch < minRefreshInterval) {
          console.debug(`[ChatStore] Skipping fetchHistory - last fetch was ${Math.round(timeSinceLastFetch / 1000)}s ago`);
          return;
        }

        console.log('[ChatStore] Setting isLoadingHistory=true');
        set({ isLoadingHistory: true, historyError: null });

        try {
          console.debug(`[ChatStore] Fetching history (forceRefresh=${forceRefresh})`);
          console.time('[ChatStore] historyService.fetchHistory');
          const historyData = await historyService.fetchHistory(forceRefresh);
          console.timeEnd('[ChatStore] historyService.fetchHistory');

          console.log('[ChatStore] Received history data:', {
            dataType: typeof historyData,
            isArray: Array.isArray(historyData),
            length: Array.isArray(historyData) ? historyData.length : 'N/A',
            sample: Array.isArray(historyData) && historyData.length > 0
              ? JSON.stringify(historyData[0]).substring(0, 200)
              : 'No data'
          });

          // Process history data into conversations map
          console.log('[ChatStore] Before syncConversationsFromHistory');
          console.time('[ChatStore] syncConversationsFromHistory');
          get().syncConversationsFromHistory(historyData);
          console.timeEnd('[ChatStore] syncConversationsFromHistory');
          console.log('[ChatStore] After syncConversationsFromHistory');

          console.log('[ChatStore] Setting isLoadingHistory=false and updating lastHistoryFetch');
          set({
            isLoadingHistory: false,
            lastHistoryFetch: Date.now()
          });

          console.log(`[ChatStore] History fetched and store updated with ${historyData.length} conversations`);
        } catch (error) {
          console.error("Failed to fetch history:", error);
          set({
            isLoadingHistory: false,
            historyError: error instanceof Error ? error.message : 'Failed to load history',
            lastHistoryFetch: Date.now() // Still update timestamp to prevent immediate retry
          });
        }
      },

      // Update a conversation's title
      updateConversationTitle: (id: string, title: string) => {
        set((state) => {
          // Skip if conversation doesn't exist
          if (!state.conversations[id]) {
            console.warn(`[ChatStore] Attempted to update title for non-existent conversation: ${id}`);
            return {};
          }

          console.debug(`[ChatStore] Updating title for chat ${id}: "${title}"`);

          return {
            conversations: {
              ...state.conversations,
              [id]: {
                ...state.conversations[id],
                title,
                updatedAt: new Date().toISOString()
              }
            }
          };
        });
      },

      // Remove a conversation that failed to save to the database
      removeConversationOptimistic: (id: string) => {
        console.warn(`[ChatStore] Removing optimistically created conversation ${id} due to database failure`);

        set(state => {
          const newConversations = { ...state.conversations };
          delete newConversations[id];

          // If this was the current conversation, find a new one
          let newCurrentId = state.currentConversationId;

          if (state.currentConversationId === id) {
            const conversationIds = Object.keys(newConversations);
            newCurrentId = conversationIds.length > 0 ? conversationIds[0] : null;

            // Navigate if needed
            if (typeof window !== 'undefined') {
              if (newCurrentId) {
                window.location.href = `/chat/${newCurrentId}`;
              } else {
                window.location.href = '/chat';
              }
            }
          }

          return {
            conversations: newConversations,
            currentConversationId: newCurrentId
          };
        });
      },

      // Enhanced createConversation with optimistic updates
      createConversation: () => {
        const id = uuidv4();
        const timestamp = new Date().toISOString();
        const selectedAgentId = get().selectedAgentId;
        const deepSearchEnabled = get().deepSearchEnabled;

        // Create new conversation object
        const newConversation: Conversation = {
          id,
          messages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          title: 'New Conversation',
          agentId: selectedAgentId,
          deepSearchEnabled
        };

        // 1. Update local state immediately (optimistic update)
        set((state) => {
          // Create a new conversations object
          const newConversations: Record<string, Conversation> = {};

          // Add the new conversation first (so it appears at the top)
          newConversations[id] = newConversation;

          // Then add all existing conversations
          Object.keys(state.conversations).forEach(key => {
            newConversations[key] = state.conversations[key];
          });

          return {
            conversations: newConversations,
            currentConversationId: id
          };
        });

        console.debug(`[ChatStore] Optimistically created new chat ${id}`);

        // 2. Create session in the database asynchronously
        if (typeof window !== 'undefined') {
          (async () => {
            try {
              console.debug(`[ChatStore] Creating session in database: ${id}`);
              const response = await fetch('/api/chat/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id,
                  title: 'New Conversation',
                  agentId: selectedAgentId,
                  deepSearchEnabled
                })
              });

              if (!response.ok) {
                console.error(`Failed to create chat session in database: ${response.status}`);

                // Revert optimistic update on failure
                get().removeConversationOptimistic(id);
                return;
              }

              // Success - force refresh history to ensure sidebar is updated
              setTimeout(() => get().fetchHistory(true), 500);

            } catch (error) {
              console.error('Failed to create chat session in database:', error);

              // Revert optimistic update on error
              get().removeConversationOptimistic(id);
            }
          })();
        }

        return id;
      },

      setCurrentConversation: (id) => {
        set({ currentConversationId: id });
      },

      getConversation: (id) => {
        return get().conversations[id];
      },

      addMessage: (message) => {
        const { currentConversationId, conversations } = get();
        if (!currentConversationId) return;

        const messageWithId = message.id ? message : { ...message, id: uuidv4() };
        const timestamp = new Date().toISOString();

        // Remove title generation from client-side
        set({
          conversations: {
            ...conversations,
            [currentConversationId]: {
              ...conversations[currentConversationId],
              messages: [...conversations[currentConversationId].messages, messageWithId],
              updatedAt: timestamp,
              // No title update here - handled by backend now
            }
          }
        });
      },

      updateMessages: (conversationId, messages) => {
        const { conversations } = get();
        if (!conversations[conversationId]) return;

        const timestamp = new Date().toISOString();

        // Get existing messages to preserve any enhanced properties
        const existingMessages = conversations[conversationId].messages;
        const existingMessageMap = new Map();
        existingMessages.forEach(msg => {
          existingMessageMap.set(msg.id, msg);
        });

        // Merge new messages with existing ones, preserving status if available
        const mergedMessages = messages.map(msg => {
          const existingMsg = existingMessageMap.get(msg.id);
          const messageWithId = msg.id ? msg : { ...msg, id: uuidv4() };

          // If this message exists and has status info, preserve it
          if (existingMsg && (existingMsg as any).status) {
            return {
              ...messageWithId,
              status: (existingMsg as any).status === 'sending' ? 'complete' : (existingMsg as any).status,
              serverConfirmed: true
            };
          }

          return messageWithId;
        });

        set({
          conversations: {
            ...conversations,
            [conversationId]: {
              ...conversations[conversationId],
              messages: mergedMessages,
              updatedAt: timestamp
            }
          }
        });
      },

      clearConversation: () => {
        const id = uuidv4();
        const timestamp = new Date().toISOString();
        const selectedAgentId = get().selectedAgentId;
        const deepSearchEnabled = get().deepSearchEnabled;

        // Create a new conversation with optimistic update
        const newConversation: Conversation = {
          id,
          messages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          title: 'New Conversation',
          agentId: selectedAgentId,
          deepSearchEnabled
        };

        // Update local state immediately
        set((state) => {
          // Create a new conversations object
          const newConversations: Record<string, Conversation> = {};

          // Add the new conversation first (so it appears at the top)
          newConversations[id] = newConversation;

          // Then add all existing conversations
          Object.keys(state.conversations).forEach(key => {
            newConversations[key] = state.conversations[key];
          });

          return {
            conversations: newConversations,
            currentConversationId: id
          };
        });

        // Create session in the database
        if (typeof window !== 'undefined') {
          (async () => {
            try {
              console.debug(`[ChatStore] Creating session in database: ${id}`);
              const response = await fetch('/api/chat/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id,
                  title: 'New Conversation',
                  agentId: selectedAgentId,
                  deepSearchEnabled
                })
              });

              if (!response.ok) {
                console.error(`Failed to create chat session in database: ${response.status}`);

                // Revert optimistic update on failure
                get().removeConversationOptimistic(id);
                return;
              }

              // Success - force refresh history
              setTimeout(() => get().fetchHistory(true), 500);

            } catch (error) {
              console.error('Failed to create chat session in database:', error);

              // Revert optimistic update on error
              get().removeConversationOptimistic(id);
            }
          })();
        }

        return id;
      },

      ensureMessageIds: (messages) => {
        return messages.map(msg => {
          if (!msg.id) {
            return {
              ...msg,
              id: uuidv4()
            };
          }
          return msg;
        });
      },

      updateConversationMetadata: (conversationId, metadata) => {
        const { conversations } = get();
        if (!conversations[conversationId]) return;

        set({
          conversations: {
            ...conversations,
            [conversationId]: {
              ...conversations[conversationId],
              ...metadata,
              updatedAt: new Date().toISOString()
            }
          }
        });
      },

      deleteConversation: (conversationId) => {
        const { conversations, currentConversationId } = get();
        const newConversations = { ...conversations };

        // Optimistically delete from local state first
        delete newConversations[conversationId];

        // If we're deleting the current conversation, find the most recent one
        let newCurrentId = currentConversationId;

        if (currentConversationId === conversationId) {
          // Find the most recent conversation by updatedAt date
          const remainingConversations = Object.values(newConversations);
          if (remainingConversations.length > 0) {
            // Sort by updatedAt in descending order (newest first)
            remainingConversations.sort((a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            newCurrentId = remainingConversations[0].id;

            // Navigate to the most recent conversation if we're in the browser
            if (typeof window !== 'undefined') {
              // Use setTimeout to avoid state update conflicts
              setTimeout(() => {
                // Use client-side navigation to the chat
                window.location.href = `/chat/${newCurrentId}`;
              }, 0);
            }
          } else {
            // If no conversations left, set currentConversationId to null
            // but don't create a new one automatically - redirect to main chat page
            newCurrentId = null;

            // Navigate to the main chat page if no conversations left
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.href = '/chat';
              }, 0);
            }
          }
        }

        // Update local state immediately (optimistic update)
        set({
          conversations: newConversations,
          currentConversationId: newCurrentId
        });

        // Call the historyService to delete from database
        if (typeof window !== 'undefined') {
          (async () => {
            try {
              // Use the history service to delete the chat from the database
              const success = await historyService.deleteChat(conversationId);

              if (!success) {
                console.error(`Failed to delete chat from database: ${conversationId}`);
                // No need to revert the optimistic update, as refreshing history will restore the correct state
              }
            } catch (error) {
              console.error('Error deleting chat:', error);
            } finally {
              // Refresh history after deletion to update sidebar
              setTimeout(() => get().fetchHistory(true), 500);
            }
          })();
        }
      },

      setDeepSearchEnabled: (enabled) => {
        // Ensure we're working with a boolean value - use strict boolean casting
        const booleanEnabled = !!enabled;

        // Update the global setting
        set({ deepSearchEnabled: booleanEnabled });

        // Also update the current conversation's setting
        const { conversations, currentConversationId } = get();

        // Skip if no current conversation
        if (!currentConversationId) return;

        if (currentConversationId && conversations[currentConversationId]) {
          console.info(`[Deep Search] Updating conversation settings`, {
            conversationId: currentConversationId,
            deepSearchEnabled: booleanEnabled
          });

          set({
            conversations: {
              ...conversations,
              [currentConversationId]: {
                ...conversations[currentConversationId],
                deepSearchEnabled: booleanEnabled,
                updatedAt: new Date().toISOString()
              }
            }
          });
        }
      },

      getDeepSearchEnabled: () => {
        return get().deepSearchEnabled;
      },

      setSelectedAgent: (agentId) => {
        set({ selectedAgentId: agentId });
      },

      getSelectedAgent: () => {
        return get().selectedAgentId;
      },

      setDeepSearchInProgress: (inProgress) => {
        set({ isDeepSearchInProgress: inProgress });
      },

      isAnySearchInProgress: () => {
        // Now checks both history loading and deep search
        return get().isDeepSearchInProgress || get().isLoadingHistory;
      },

      // Refresh history data without changing current conversation ID
      refreshHistoryData: async () => {
        const currentId = get().currentConversationId;
        const { isLoadingHistory } = get();

        // Skip if already loading
        if (isLoadingHistory) {
          console.debug('[ChatStore] Skipping history refresh - already in progress');
          return;
        }

        console.debug('[ChatStore] Refreshing history data without navigation');
        set({ isLoadingHistory: true, historyError: null });

        try {
          // Store the current ID to preserve it throughout the refresh
          const idToRestore = currentId;

          // Fetch history data
          const data = await historyService.fetchHistory(true);

          // Sync conversations without changing current ID
          get().syncConversationsFromHistory(data);

          // Always restore the previous conversation ID if it still exists
          if (idToRestore) {
            const conversations = get().conversations;
            // Check if the conversation still exists in the refreshed data
            if (conversations[idToRestore]) {
              console.debug(`[ChatStore] Restoring current conversation ID: ${idToRestore}`);
              set({ currentConversationId: idToRestore });
            } else {
              console.debug(`[ChatStore] Previous conversation ${idToRestore} no longer exists after refresh`);
            }
          }

          set({
            lastHistoryFetch: Date.now(),
            isLoadingHistory: false
          });
        } catch (error) {
          set({
            historyError: error instanceof Error ? error.message : String(error),
            isLoadingHistory: false
          });
        }
      }
    }),
    {
      name: 'chat-storage',
      version: 1,
      storage: createJSONStorage(() => createDebugStorage()),
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
        selectedAgentId: state.selectedAgentId,
        deepSearchEnabled: state.deepSearchEnabled,
        // Don't persist full conversation data, fetch from API instead
      }),
      // Enhanced onRehydrateStorage callback to handle hydration state
      onRehydrateStorage: () => {
        // Capture a reference to the setState function after store creation
        // We'll use this in a setTimeout to avoid the circular reference
        let hydrationComplete = false;

        // Return handler that will be called when hydration is complete or fails
        return (rehydratedState, error) => {
          if (error) {
            console.error('Error rehydrating chat store:', error);
          } else {
            console.debug('[ChatStore] Hydration complete');
            // Set a flag indicating hydration is complete
            hydrationComplete = true;

            // Use setTimeout to update the hydration state after store is fully initialized
            setTimeout(() => {
              if (hydrationComplete) {
                useChatStore.setState({ isHydrated: true });
              }
            }, 0);
          }
        };
      },
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          const v0State = persistedState as ChatStateV0;
          return {
            ...v0State,
            selectedAgentId: 'default' as AgentType,
            deepSearchEnabled: false,
            conversations: Object.fromEntries(
              Object.entries(v0State.conversations).map(([id, conv]) => [
                id,
                {
                  ...conv,
                  agentId: 'default' as AgentType,
                  deepSearchEnabled: false,
                  updatedAt: conv.createdAt
                }
              ])
            )
          };
        }
        return persistedState;
      }
    }
  )
); 