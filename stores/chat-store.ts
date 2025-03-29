import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Message } from 'ai';
import { type AgentType } from '@/lib/chat-engine/prompts';

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
}

// Custom storage with debug logging
const createDebugStorage = (options?: { enabled?: boolean }): StateStorage => {
  const isDebugEnabled = options?.enabled ?? process.env.NODE_ENV !== 'production';

  return {
    getItem: (name: string): string | null => {
      const value = localStorage.getItem(name);
      if (isDebugEnabled) {
        console.debug(`[ChatStore] Loading from storage: ${name.substring(0, 20)}...`);
      }
      return value;
    },
    setItem: (name: string, value: string): void => {
      if (isDebugEnabled) {
        console.debug(`[ChatStore] Saving to storage: ${name.substring(0, 20)}...`);
      }
      localStorage.setItem(name, value);
    },
    removeItem: (name: string): void => {
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

      createConversation: () => {
        const id = uuidv4();
        const timestamp = new Date().toISOString();
        const selectedAgentId = get().selectedAgentId;
        const deepSearchEnabled = get().deepSearchEnabled;

        // Update local state
        set((state) => ({
          conversations: {
            ...state.conversations,
            [id]: {
              id,
              messages: [],
              createdAt: timestamp,
              updatedAt: timestamp,
              title: 'New Chat', // Use "New Chat" to match the title generation condition
              agentId: selectedAgentId,
              deepSearchEnabled: state.deepSearchEnabled
            }
          },
          currentConversationId: id
        }));

        // Create session in the database
        if (typeof window !== 'undefined') {
          // Use setTimeout to not block the UI while creating the session
          setTimeout(async () => {
            try {
              console.debug(`[ChatStore] Creating session in database: ${id}`);
              const response = await fetch('/api/chat/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id,
                  title: 'New Chat', // Match the local state
                  agentId: selectedAgentId,
                  deepSearchEnabled
                })
              });

              if (!response.ok) {
                console.error(`Failed to create chat session in database: ${response.status}`, await response.text());
                // Invalidate history cache to ensure we don't get out of sync
                setTimeout(() => {
                  try {
                    fetch('/api/history/invalidate', { method: 'POST' }).catch(e => console.error('Failed to invalidate history:', e));
                  } catch (error) {
                    console.error('Failed to invalidate history:', error);
                  }
                }, 1000);
              }
            } catch (error) {
              console.error('Failed to create chat session in database:', error);
            }
          }, 0);
        }

        return id;
      },

      setCurrentConversation: (id) => {
        set({ currentConversationId: id });
      },

      getConversation: (id) => {
        const { conversations } = get();
        return conversations[id];
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

        // Create a new conversation without clearing localStorage history
        set((state) => ({
          conversations: {
            ...state.conversations,  // Preserve existing conversations
            [id]: {
              id,
              messages: [],
              createdAt: timestamp,
              updatedAt: timestamp,
              title: 'New Conversation',
              userId: undefined,
              agentId: 'default' as AgentType,
              metadata: {},
              deepSearchEnabled: false
            }
          },
          currentConversationId: id
        }));

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

        delete newConversations[conversationId];

        // If we're deleting the current conversation, find the most recent one
        let newCurrentId = currentConversationId;

        if (currentConversationId === conversationId) {
          // Find the most recent conversation
          const remainingConversations = Object.values(newConversations);
          if (remainingConversations.length > 0) {
            // Sort by updatedAt in descending order
            remainingConversations.sort((a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            newCurrentId = remainingConversations[0].id;

            // Navigate to the new conversation if we're in the browser
            if (typeof window !== 'undefined') {
              // Use setTimeout to avoid state update conflicts
              setTimeout(() => {
                // Use client-side navigation to the new chat
                window.location.href = `/chat/${newCurrentId}`;
              }, 0);
            }
          } else {
            newCurrentId = null;

            // Navigate to the main chat page if no conversations left
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.href = '/chat';
              }, 0);
            }
          }
        }

        set({
          conversations: newConversations,
          currentConversationId: newCurrentId
        });
      },

      setSelectedAgent: (agentId: AgentType) => {
        set({ selectedAgentId: agentId });

        // Update current conversation if it exists
        const { currentConversationId, conversations } = get();
        if (currentConversationId && conversations[currentConversationId]) {
          set({
            conversations: {
              ...conversations,
              [currentConversationId]: {
                ...conversations[currentConversationId],
                agentId,
                updatedAt: new Date().toISOString()
              }
            }
          });
        }
      },

      getSelectedAgent: () => {
        return get().selectedAgentId;
      },

      setDeepSearchEnabled: (enabled) => {
        // Ensure we're working with a boolean value - use strict boolean casting
        const booleanEnabled = enabled === true;

        // Log the toggle state change for debugging
        console.info(`[Deep Search] Toggle state changed`, {
          timestamp: new Date().toISOString(),
          oldState: get().deepSearchEnabled,
          newState: booleanEnabled,
          newStateType: typeof booleanEnabled,
          originalValueType: typeof enabled,
          originalValue: enabled,
          environment: process.env.NODE_ENV || 'unknown',
          conversationId: get().currentConversationId
        });

        // Set the boolean flag
        set({ deepSearchEnabled: booleanEnabled });

        // Update current conversation if it exists
        const { currentConversationId, conversations } = get();
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

      setDeepSearchInProgress: (inProgress) => {
        set({ isDeepSearchInProgress: inProgress });
      },

      isAnySearchInProgress: () => {
        // This function can be used to check if either regular loading or deep search is happening
        // Will be used by the UI to determine when to show the loading indicator
        return get().isDeepSearchInProgress;
      }
    }),
    {
      name: 'chat-storage',
      version: 1,
      storage: createJSONStorage(() => createDebugStorage()),
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