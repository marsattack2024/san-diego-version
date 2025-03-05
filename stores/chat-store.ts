import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Message } from 'ai';

// Define a more comprehensive conversation type for Supabase integration
export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  title?: string;
  userId?: string; // For Supabase auth integration
  agentId?: string; // Track which agent was used
  metadata?: Record<string, any>; // For additional data like settings
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
      
      createConversation: () => {
        const id = uuidv4();
        const timestamp = new Date().toISOString();
        
        set((state) => ({
          conversations: {
            ...state.conversations,
            [id]: {
              id,
              messages: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            }
          },
          currentConversationId: id
        }));
        
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
        
        set({
          conversations: {
            ...conversations,
            [currentConversationId]: {
              ...conversations[currentConversationId],
              messages: [...conversations[currentConversationId].messages, messageWithId],
              updatedAt: timestamp,
              // Auto-generate a title from the first user message if none exists
              title: !conversations[currentConversationId].title && 
                     message.role === 'user' && 
                     conversations[currentConversationId].messages.length === 0
                ? message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '')
                : conversations[currentConversationId].title
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
              agentId: undefined,
              metadata: {}
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
        
        // If we're deleting the current conversation, set current to null
        const newCurrentId = 
          currentConversationId === conversationId 
            ? null 
            : currentConversationId;
        
        set({
          conversations: newConversations,
          currentConversationId: newCurrentId
        });
      }
    }),
    {
      name: 'chat-storage',
      version: 1,
      storage: createJSONStorage(() => createDebugStorage()),
      migrate: (persistedState: unknown, version): ChatState => {
        console.debug(`[ChatStore] Migrating from version ${version}`);
        
        if (version === 0) {
          // Migrate from v0 to v1
          const oldState = persistedState as ChatStateV0;
          
          // Create new state with updated conversation structure
          const newConversations: Record<string, Conversation> = {};
          
          Object.entries(oldState.conversations).forEach(([id, oldConversation]) => {
            const timestamp = oldConversation.createdAt || new Date().toISOString();
            
            newConversations[id] = {
              ...oldConversation,
              updatedAt: timestamp,
              // Add any new fields with default values
              userId: undefined,
              agentId: undefined,
              metadata: {}
            };
          });
          
          return {
            ...oldState,
            conversations: newConversations,
            // We need to add these methods, but they'll be replaced by the store
            createConversation: () => '',
            setCurrentConversation: () => {},
            getConversation: () => undefined,
            addMessage: () => {},
            updateMessages: () => {},
            clearConversation: () => {},
            ensureMessageIds: (msgs) => msgs,
            updateConversationMetadata: () => {},
            deleteConversation: () => {}
          };
        }
        
        // If we don't recognize the version, return the state as is
        return persistedState as ChatState;
      }
    }
  )
); 