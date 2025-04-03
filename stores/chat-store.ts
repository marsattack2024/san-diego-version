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

// Define a lightweight ConversationMetadata type for the sidebar
export interface ConversationMetadata {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  agentId: AgentType;
  deepSearchEnabled?: boolean;
  messageCount: number; // Track message count without storing messages
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
  // Split conversations into two separate data structures
  conversations: Record<string, Conversation>; // Legacy support for backward compatibility
  conversationsIndex: Record<string, ConversationMetadata>; // Lightweight metadata for sidebar
  loadedConversations: Record<string, Conversation>; // Full conversations with messages for active chats

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

  // Add new actions for managing the split storage
  getConversationMetadata: (id: string) => ConversationMetadata | undefined;
  ensureConversationLoaded: (id: string) => Promise<Conversation | undefined>;
  isConversationLoaded: (id: string) => boolean;
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
      conversations: {}, // Keep for backward compatibility
      conversationsIndex: {}, // New lightweight sidebar index
      loadedConversations: {}, // New storage for fully loaded conversations
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

        // Convert array to map for faster access - ONLY METADATA
        const conversationsIndexMap: Record<string, ConversationMetadata> = {};

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
            // Create metadata object (no messages)
            conversationsIndexMap[chat.id] = {
              id: chat.id,
              title: chat.title || 'Untitled',
              createdAt: chat.createdAt || new Date().toISOString(),
              updatedAt: chat.updatedAt || new Date().toISOString(),
              agentId: ((chat as any).agentId as AgentType) || 'default',
              deepSearchEnabled: (chat as any).deepSearchEnabled || false,
              userId: chat.userId,
              messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0
            };
          } catch (error) {
            console.error('[ChatStore] Error processing chat item:', error, chat);
          }

          index++;
        }

        console.timeEnd('[ChatStore] conversion to map');
        console.log('[ChatStore] Finished converting history to index map with', Object.keys(conversationsIndexMap).length, 'conversations');

        try {
          console.time('[ChatStore] state update');
          set((state) => {
            // Get the current states
            const existingIndex = state.conversationsIndex;
            const existingLoaded = state.loadedConversations;

            // Create a new merged index
            const mergedIndex = { ...existingIndex };

            // Log pre-merge state
            console.debug('[ChatStore] Pre-merge state', {
              category: 'chat',
              operation: 'syncConversationsFromHistory',
              existingIndexCount: Object.keys(existingIndex).length,
              existingLoadedCount: Object.keys(existingLoaded).length,
              fetchedCount: Object.keys(conversationsIndexMap).length,
              // Log keys to see IDs
              existingIndexKeys: JSON.stringify(Object.keys(existingIndex).slice(0, 5)),
              fetchedKeys: JSON.stringify(Object.keys(conversationsIndexMap).slice(0, 5))
            });

            // Update only the index with new metadata
            for (const chatId in conversationsIndexMap) {
              mergedIndex[chatId] = {
                ...(existingIndex[chatId] || {}), // Keep existing metadata if any
                ...conversationsIndexMap[chatId], // Update with new metadata
              };

              // If this conversation is currently loaded, update its metadata too
              // but preserve its messages
              if (existingLoaded[chatId]) {
                existingLoaded[chatId] = {
                  ...existingLoaded[chatId],
                  title: conversationsIndexMap[chatId].title,
                  updatedAt: conversationsIndexMap[chatId].updatedAt,
                  agentId: conversationsIndexMap[chatId].agentId,
                  deepSearchEnabled: conversationsIndexMap[chatId].deepSearchEnabled,
                  userId: conversationsIndexMap[chatId].userId,
                  // NOTE: We don't update messages - they remain as loaded
                };
              }
            }

            // Also update legacy conversations map for backward compatibility
            const legacyConversations = { ...state.conversations };
            for (const chatId in conversationsIndexMap) {
              if (legacyConversations[chatId]) {
                // If it exists in legacy map, update metadata but preserve messages
                legacyConversations[chatId] = {
                  ...legacyConversations[chatId],
                  title: conversationsIndexMap[chatId].title,
                  updatedAt: conversationsIndexMap[chatId].updatedAt,
                  agentId: conversationsIndexMap[chatId].agentId,
                  deepSearchEnabled: conversationsIndexMap[chatId].deepSearchEnabled,
                  userId: conversationsIndexMap[chatId].userId,
                };
              } else if (existingLoaded[chatId]) {
                // If loaded but not in legacy, add from loaded
                legacyConversations[chatId] = existingLoaded[chatId];
              } else {
                // If neither loaded nor in legacy, add skeleton with empty messages
                legacyConversations[chatId] = {
                  id: chatId,
                  title: conversationsIndexMap[chatId].title,
                  createdAt: conversationsIndexMap[chatId].createdAt,
                  updatedAt: conversationsIndexMap[chatId].updatedAt,
                  messages: [], // empty messages for skeleton
                  agentId: conversationsIndexMap[chatId].agentId,
                  deepSearchEnabled: conversationsIndexMap[chatId].deepSearchEnabled,
                  userId: conversationsIndexMap[chatId].userId,
                };
              }
            }

            // Log the final merged state
            console.debug(`[ChatStore] Merged state result`, {
              category: 'chat',
              operation: 'syncConversationsFromHistory',
              mergedIndexCount: Object.keys(mergedIndex).length,
              loadedConversationsCount: Object.keys(existingLoaded).length,
              legacyConversationsCount: Object.keys(legacyConversations).length,
              fetchedCount: Object.keys(conversationsIndexMap).length
            });

            // Return updated state - keep loadedConversations unchanged
            return {
              conversationsIndex: mergedIndex,
              conversations: legacyConversations, // Update legacy for compatibility
              // loadedConversations remains unchanged!
            };
          });
          console.timeEnd('[ChatStore] state update');
          console.log('[ChatStore] State updated successfully via merge');
        } catch (error) {
          console.error('[ChatStore] Error updating state with conversations:', error);
        }

        console.debug(`[ChatStore] Synchronized ${historyData.length} conversations to index`);
      },

      // Get conversation metadata (for sidebar)
      getConversationMetadata: (id) => {
        return get().conversationsIndex[id];
      },

      // Check if a conversation is fully loaded
      isConversationLoaded: (id) => {
        return !!get().loadedConversations[id];
      },

      // Ensure conversation is loaded - fetch if needed
      ensureConversationLoaded: async (id) => {
        const state = get();

        // Already loaded
        if (state.loadedConversations[id]) {
          console.debug(`[ChatStore] Conversation ${id} already loaded`);
          return state.loadedConversations[id];
        }

        console.debug(`[ChatStore] Loading conversation ${id} from API`);

        try {
          // Set loading state if needed

          // Fetch from API
          const response = await fetch(`/api/chat/${id}?_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            },
            credentials: 'same-origin'
          });

          if (!response.ok) {
            throw new Error(`Failed to load conversation: ${response.status}`);
          }

          const data = await response.json();
          const chatData = data.success && data.data ? data.data : data;

          if (!chatData || !chatData.id) {
            throw new Error('Invalid chat data received');
          }

          // Create full conversation object
          const conversation: Conversation = {
            id: id,
            messages: Array.isArray(chatData.messages) ? chatData.messages : [],
            createdAt: chatData.createdAt || new Date().toISOString(),
            updatedAt: chatData.updatedAt || new Date().toISOString(),
            title: chatData.title || 'New Chat',
            agentId: chatData.agentId || state.selectedAgentId,
            deepSearchEnabled: chatData.deepSearchEnabled || false,
            userId: chatData.userId
          };

          // Update store with loaded conversation
          set(state => ({
            loadedConversations: {
              ...state.loadedConversations,
              [id]: conversation
            },
            // Also update legacy conversations for compatibility
            conversations: {
              ...state.conversations,
              [id]: conversation
            }
          }));

          console.debug(`[ChatStore] Successfully loaded conversation ${id} (${conversation.messages.length} messages)`);
          return conversation;
        } catch (error) {
          console.error(`[ChatStore] Error loading conversation ${id}:`, error);
          return undefined;
        }
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
          console.log('[ChatStore] History fetch already in progress, skipping duplicate fetch');
          return;
        }

        try {
          // Set loading state
          set({ isLoadingHistory: true, historyError: null });

          console.debug('[ChatStore] Calling historyService.fetchHistory()');
          // Attempt to fetch history from API
          const historyData = await historyService.fetchHistory(forceRefresh);
          console.debug('[ChatStore] Got history data from historyService:', {
            count: historyData?.length || 0,
            firstFewIds: historyData?.slice(0, 3).map(h => h.id).join(', ') || 'none'
          });

          if (!historyData || !Array.isArray(historyData)) {
            console.error('[ChatStore] History data is not an array or is empty');
            throw new Error('Received invalid history data');
          }

          // If we get here, the fetch was successful
          set({
            isLoadingHistory: false,
            lastHistoryFetch: Date.now(),
            historyError: null
          });
          console.debug('[ChatStore] Successfully fetched history:', historyData.length, 'items');

          // Synchronize the fetched history with our store
          state.syncConversationsFromHistory(historyData);

          console.debug('[ChatStore] History fetch complete and synchronized.');
          return;
        } catch (error) {
          // Handle errors
          console.error('[ChatStore] Error fetching history:', error);

          set({
            isLoadingHistory: false,
            historyError: error instanceof Error ? error.message : 'Failed to fetch history'
          });

          // Don't throw - we want to handle the error in the UI
          return;
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
          // Create new objects without the failed conversation
          const newConversations = { ...state.conversations };
          const newConversationsIndex = { ...state.conversationsIndex };
          const newLoadedConversations = { ...state.loadedConversations };

          // Remove from all data structures
          delete newConversations[id];
          delete newConversationsIndex[id];
          delete newLoadedConversations[id];

          // If this was the current conversation, find a new one
          let newCurrentId = state.currentConversationId;

          if (state.currentConversationId === id) {
            // Try to find a conversation from the index (most reliable)
            const conversationIds = Object.keys(newConversationsIndex);
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
            conversationsIndex: newConversationsIndex,
            loadedConversations: newLoadedConversations,
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

        // Create metadata for index
        const newMetadata: ConversationMetadata = {
          id,
          title: 'New Conversation',
          createdAt: timestamp,
          updatedAt: timestamp,
          agentId: selectedAgentId,
          deepSearchEnabled,
          messageCount: 0
        };

        // 1. Update local state immediately (optimistic update for all data structures)
        set((state) => {
          // Update all three data structures
          return {
            // Legacy conversations
            conversations: {
              [id]: newConversation,
              ...state.conversations
            },
            // Index for sidebar
            conversationsIndex: {
              [id]: newMetadata,
              ...state.conversationsIndex
            },
            // Fully loaded conversations
            loadedConversations: {
              [id]: newConversation,
              ...state.loadedConversations
            },
            currentConversationId: id
          };
        });

        console.debug(`[ChatStore] Optimistically created new chat ${id} in all data structures`);

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
        // First check loaded conversations
        const loaded = get().loadedConversations[id];
        if (loaded) return loaded;

        // Fall back to legacy
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
        if (!conversations[conversationId]) {
          console.warn(`[ChatStore.updateMessages] Conversation ${conversationId} not found. Skipping update.`);
          return;
        }

        console.log(`[ChatStore.updateMessages] Updating messages for ${conversationId}. Received ${messages.length} messages.`);

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

        // **Detailed Logging Before State Update**
        console.log(`[ChatStore.updateMessages] Merged messages for ${conversationId}:`, JSON.stringify(mergedMessages.map(m => ({ id: m.id, role: m.role, len: m.content.length })), null, 2));
        console.log(`[ChatStore.updateMessages] Current messages in state before update for ${conversationId}:`, JSON.stringify(conversations[conversationId].messages.map(m => ({ id: m.id, role: m.role, len: m.content.length })), null, 2));

        set((state) => {
          // Ensure we have the latest state reference inside set()
          const currentConversations = state.conversations;
          if (!currentConversations[conversationId]) {
            console.warn(`[ChatStore.updateMessages] Conversation ${conversationId} disappeared before state update!`);
            return state; // Return unchanged state
          }

          const newState = {
            conversations: {
              ...currentConversations,
              [conversationId]: {
                ...currentConversations[conversationId],
                messages: mergedMessages,
              }
            }
          };
          console.log(`[ChatStore.updateMessages] Setting new state for ${conversationId}. Messages count: ${newState.conversations[conversationId].messages.length}`);

          // **Log state AFTER update**
          const finalState = get().conversations[conversationId];
          console.log(`[ChatStore.updateMessages] State AFTER update for ${conversationId}:`, JSON.stringify(finalState?.messages?.map(m => ({ id: m.id, role: m.role, len: m.content.length })), null, 2));

          return newState;
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

        // Create metadata for index
        const newMetadata: ConversationMetadata = {
          id,
          title: 'New Conversation',
          createdAt: timestamp,
          updatedAt: timestamp,
          agentId: selectedAgentId,
          deepSearchEnabled,
          messageCount: 0
        };

        // Update local state immediately in all data structures
        set((state) => {
          return {
            // Legacy conversations
            conversations: {
              [id]: newConversation,
              ...state.conversations
            },
            // Index for sidebar
            conversationsIndex: {
              [id]: newMetadata,
              ...state.conversationsIndex
            },
            // Fully loaded conversations
            loadedConversations: {
              [id]: newConversation,
              ...state.loadedConversations
            },
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

      // Delete a conversation
      deleteConversation: (conversationId) => {
        const state = get();

        // Verify conversation exists before trying to delete
        if (!state.conversationsIndex[conversationId]) {
          console.warn(`[ChatStore] Attempted to delete non-existent conversation: ${conversationId}`);
          return;
        }

        console.debug(`[ChatStore] Deleting conversation: ${conversationId}`);

        // Update state to remove conversation from all data structures
        set(state => {
          // Create new objects without the deleted conversation
          const newConversationsIndex = { ...state.conversationsIndex };
          const newLoadedConversations = { ...state.loadedConversations };
          const newConversations = { ...state.conversations }; // Legacy

          // Delete from all maps
          delete newConversationsIndex[conversationId];
          delete newLoadedConversations[conversationId];
          delete newConversations[conversationId];

          // Update current conversation ID if needed
          let newCurrentId = state.currentConversationId;
          if (state.currentConversationId === conversationId) {
            // Find a new conversation to select
            const remainingIds = Object.keys(newConversationsIndex);
            newCurrentId = remainingIds.length > 0 ? remainingIds[0] : null;

            // Redirect if we're in browser
            if (typeof window !== 'undefined') {
              if (newCurrentId) {
                window.location.href = `/chat/${newCurrentId}`;
              } else {
                window.location.href = '/chat';
              }
            }
          }

          return {
            conversationsIndex: newConversationsIndex,
            loadedConversations: newLoadedConversations,
            conversations: newConversations,
            currentConversationId: newCurrentId
          };
        });

        // Delete from backend asynchronously
        if (typeof window !== 'undefined') {
          (async () => {
            try {
              const deleted = await historyService.deleteChat(conversationId);

              if (deleted) {
                console.debug(`[ChatStore] Successfully deleted conversation ${conversationId} from backend`);
              } else {
                console.error(`[ChatStore] Failed to delete conversation ${conversationId} from backend`);
              }
            } catch (error) {
              console.error(`[ChatStore] Error deleting conversation ${conversationId}:`, error);
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

          // Create initial conversationsIndex from legacy conversations
          const conversationsIndex: Record<string, ConversationMetadata> = {};

          // Copy conversations to loadedConversations when migrating
          const loadedConversations: Record<string, Conversation> = {};

          // Process old conversation data
          Object.entries(v0State.conversations).forEach(([id, conv]) => {
            // Create metadata for the index
            conversationsIndex[id] = {
              id,
              title: conv.title || 'Untitled',
              createdAt: conv.createdAt,
              updatedAt: conv.createdAt, // Old format didn't have updatedAt
              agentId: 'default' as AgentType,
              deepSearchEnabled: false,
              messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0
            };

            // Store full conversation in loadedConversations
            loadedConversations[id] = {
              ...conv,
              agentId: 'default' as AgentType,
              deepSearchEnabled: false,
              updatedAt: conv.createdAt
            };
          });

          // Return migrated state with new data structures
          return {
            ...v0State,
            selectedAgentId: 'default' as AgentType,
            deepSearchEnabled: false,
            conversationsIndex,
            loadedConversations,
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

        // For newer persisted states that might have conversations but not the new fields
        if (persistedState.conversations && !persistedState.conversationsIndex) {
          console.debug('[ChatStore] Migrating modern state to include conversationsIndex');

          // Create conversationsIndex from conversations
          const conversationsIndex: Record<string, ConversationMetadata> = {};

          Object.entries(persistedState.conversations).forEach(([id, conv]: [string, any]) => {
            conversationsIndex[id] = {
              id,
              title: conv.title || 'Untitled',
              createdAt: conv.createdAt || new Date().toISOString(),
              updatedAt: conv.updatedAt || conv.createdAt || new Date().toISOString(),
              agentId: conv.agentId || 'default',
              deepSearchEnabled: conv.deepSearchEnabled || false,
              userId: conv.userId,
              messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0
            };
          });

          return {
            ...persistedState,
            conversationsIndex,
            loadedConversations: { ...persistedState.conversations }
          };
        }

        return persistedState;
      }
    }
  )
); 