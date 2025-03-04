import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat, Message as ApiMessage } from 'ai/react';
import { v4 as uuidv4 } from 'uuid';
import { useIsClient } from './useIsClient';
import { useChatStore } from '@/stores/chat-store';
import { createLogger } from '@/utils/client-logger';
// Import commented out due to missing module
// import { useConversations } from './useConversations';
import { debounce, throttle } from 'lodash';
// Import commented out due to missing module
// import { logger } from '@/lib/client-logger';

// Create a logger for this hook
const log = createLogger('useEnhancedChat');

// Define message status types
export type MessageStatus = 'pending' | 'sending' | 'complete' | 'error';

export interface EnhancedMessage extends ApiMessage {
  localId: string;
  status: MessageStatus;
  serverConfirmed: boolean;
  timestamp: number;
  reconciled?: boolean;
}

// Define interface for useEnhancedChat options
export interface UseEnhancedChatOptions {
  api?: string; // Make api optional to fix the error
  key?: string;
  id?: string;
  body?: Record<string, any>;
  initialMessages?: ApiMessage[];
  initialInput?: string;
  sendExtraMessageFields?: boolean;
  experimental_throttle?: number;
  onError?: (error: Error) => void;
  onResponse?: (response: Response) => void;
  onFinish?: (message: ApiMessage) => void;
}

// Define the enhanceMessage function
const enhanceMessage = (
  message: ApiMessage, 
  status: MessageStatus = 'complete', 
  serverConfirmed: boolean = true
): EnhancedMessage => {
  return {
    ...message,
    localId: message.id || uuidv4(),
    status,
    serverConfirmed,
    timestamp: Date.now()
  };
};

export function useEnhancedChat({
  api = '/api/chat',
  key,
  id,
  body,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields = false,
  onError,
  onResponse,
  onFinish
}: UseEnhancedChatOptions = {}) {
  const isClient = useIsClient();
  const initializedRef = useRef(false);
  const keyRef = useRef(key);
  const sessionIdRef = useRef<string>('');
  const sessionBaseIdRef = useRef<string | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const messageCountRef = useRef(0);
  const stateUpdateCountRef = useRef(0);
  
  // Get conversation management functions from store
  const { 
    addMessage, 
    updateMessages,
    conversations,
    getConversation,
    setCurrentConversation,
    clearConversation,
    createConversation
  } = useChatStore();
  
  // Store the current conversation ID from the store
  const storeConversationId = useChatStore(state => state.currentConversationId);
  
  // Track last message timestamp for performance metrics
  const lastMessageTimestamp = useRef<number | null>(null);
  
  // Local state for enhanced messages
  const [messages, setMessages] = useState<EnhancedMessage[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [localInput, setLocalInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localCurrentConversationId, setLocalCurrentConversationId] = useState<string | null>(null);
  
  // Generate a stable session ID that persists across re-renders
  const sessionId = useCallback(() => {
    if (!sessionIdRef.current && isClient) {
      // Generate a base session ID that will persist across agent changes
      const baseSessionId = `${id || uuidv4()}`;
      const generatedId = `${baseSessionId}-${key || 'default'}`;
      sessionIdRef.current = generatedId;
      
      // Store the base ID for reuse
      sessionBaseIdRef.current = baseSessionId;
      
      log.info('Generated new session ID', { 
        sessionId: generatedId,
        baseSessionId,
        key,
        existingId: id 
      });
    }
    return sessionIdRef.current;
  }, [id, key, isClient]);

  // Track state updates to help debug re-renders
  useEffect(() => {
    if (isClient) {
      stateUpdateCountRef.current++;
      // Only log state updates on significant changes, not on every render
      if (stateUpdateCountRef.current === 1 || stateUpdateCountRef.current % 20 === 0) {
        log.debug('State update checkpoint', {
          updateCount: stateUpdateCountRef.current,
          sessionId: sessionIdRef.current,
          messageCount: messageCountRef.current,
          hasConversationId: !!localCurrentConversationId
        });
      }
    }
  });

  // Enhanced message tracking
  useEffect(() => {
    if (messages.length !== messageCountRef.current) {
      log.debug('Message count changed', {
        previousCount: messageCountRef.current,
        newCount: messages.length,
        sessionId: sessionIdRef.current,
        conversationId: localCurrentConversationId
      });
      messageCountRef.current = messages.length;
    }
  }, [messages.length, localCurrentConversationId]);

  // Update the API body with new agent information
  // Need to implement a setBody function to update the API body with agent info
  // Since we don't have direct access to update the body in useChat
  const setBody = useRef<((prev: Record<string, any>) => Record<string, any>) | null>(null);

  // Reset session ID only when key explicitly changes
  useEffect(() => {
    if (key !== keyRef.current && isClient) {
      // Preserve the base session ID, only update the agent suffix
      const baseId = sessionBaseIdRef.current || id || uuidv4();
      const newSessionId = `${baseId}-${key || 'default'}`;
      
      log.info('Key changed, updating session', {
        oldKey: keyRef.current,
        newKey: key,
        baseSessionId: baseId,
        oldSessionId: sessionIdRef.current,
        newSessionId,
        preservingConversationId: localCurrentConversationId
      });
      
      keyRef.current = key;
      sessionIdRef.current = newSessionId;
      
      // Important: DO NOT reset these values
      // messageCountRef.current = 0;
      // stateUpdateCountRef.current = 0;
      
      // DO NOT reset chat state
      // setMessages([]);
      // setIsInitialized(false);
      // initializedRef.current = false;
      // setIsLoading(false);
      
      // Update the body for future API calls
      const updatedBody = { ...body, agentType: key };
    }
  }, [key, isClient, id, localCurrentConversationId, body]);
  
  // Define stream metrics
  const streamMetrics = useRef({
    startTime: 0,
    chunkCount: 0,
    lastChunkTime: 0,
    totalChunks: 0
  });
  
  // Initialize the AI SDK chat hook
  const {
    messages: apiMessages,
    append: originalAppend,
    reload: originalReload,
    stop,
    isLoading: apiIsLoading,
    error: apiError,
    input: apiInput,
    setInput: setApiInput,
    handleInputChange: handleApiInputChange,
    handleSubmit,
    setMessages: setApiMessages
  } = useChat({
    api,
    id,
    body: {
      ...body,
      agentType: key || 'default',
      sessionId: sessionIdRef.current
    },
    initialMessages,
    initialInput,
    sendExtraMessageFields,
    onError: (err) => {
      if (onError) onError(err);
      log.error('Chat error', {
        error: err.message,
        conversationId: localCurrentConversationId,
        sessionId: sessionIdRef.current
      });
    },
    onResponse: (response) => {
      if (onResponse) onResponse(response);
      log.debug('API response received', {
        status: response.status,
        conversationId: localCurrentConversationId,
        sessionId: sessionIdRef.current
      });
    },
    onFinish: (message) => {
      if (onFinish) onFinish(message);
      log.debug('API response complete', {
        messageLength: message.content.length,
        conversationId: localCurrentConversationId,
        sessionId: sessionIdRef.current
      });
    }
  });
  
  // Load conversation from store
  const loadConversation = useCallback((conversationId: string) => {
    if (!conversationId) {
      log.warn('Attempted to load conversation with empty ID');
      return;
    }
    
    log.info('Loading conversation', { id: conversationId });
    
    // Get conversation from store
    const selectedConversation = getConversation(conversationId);
    if (!selectedConversation) {
      log.error('Conversation not found', { id: conversationId });
      return;
    }
    
    // Set as current conversation
    setCurrentConversation(conversationId);
    setLocalCurrentConversationId(conversationId);
    
    // Create enhanced messages
    const enhancedMessages = selectedConversation.messages.map(msg => enhanceMessage(msg));
    setMessages(enhancedMessages);
    
    // Mark as initialized
    setIsInitialized(true);
    initializedRef.current = true;
    
    // Update API messages
    setApiMessages(selectedConversation.messages);
    
    log.debug('Conversation loaded', { 
      id: conversationId, 
      messageCount: selectedConversation.messages.length 
    });
  }, [getConversation, setCurrentConversation, setApiMessages]);
  
  // Initialize messages from initial state
  useEffect(() => {
    if (isClient && !isInitialized && apiMessages.length > 0) {
      log.debug('Initializing messages', { count: apiMessages.length });
      
      const enhanced = apiMessages.map(msg => enhanceMessage(msg));
      setMessages(enhanced);
      setIsInitialized(true);
      initializedRef.current = true;
      
      // If we have a current conversation ID from the store, use it
      if (storeConversationId) {
        setLocalCurrentConversationId(storeConversationId);
        updateMessages(storeConversationId, apiMessages);
      }
    }
  }, [apiMessages, isInitialized, isClient, storeConversationId, updateMessages]);
  
  // Reconcile local and API messages with enhanced logging - without debounce/throttle
  const reconcileMessages = useCallback((
    localMessages: EnhancedMessage[], 
    apiMsgs: ApiMessage[]
  ): EnhancedMessage[] => {
    const startTime = performance.now();
    const messageMap = new Map<string, EnhancedMessage>();
    
    // Log the reconciliation start
    log.debug('Starting message reconciliation', {
      localCount: localMessages.length,
      apiCount: apiMsgs.length,
      sessionId: sessionIdRef.current
    });
    
    // Add all local messages to the map with status tracking
    localMessages.forEach(msg => {
      messageMap.set(msg.id, {
        ...msg,
        reconciled: true // Mark as seen in this reconciliation
      });
    });
    
    // Update or add API messages with careful status handling
    apiMsgs.forEach(apiMsg => {
      const existingMsg = messageMap.get(apiMsg.id);
      
      if (existingMsg) {
        // Only update if content or role has changed
        if (existingMsg.content !== apiMsg.content || existingMsg.role !== apiMsg.role) {
          messageMap.set(apiMsg.id, {
            ...existingMsg,
            content: apiMsg.content,
            role: apiMsg.role,
            status: 'complete',
            serverConfirmed: true,
            reconciled: true,
            timestamp: existingMsg.timestamp // Preserve original timestamp
          });
        }
      } else {
        // Add new message
        messageMap.set(apiMsg.id, enhanceMessage(apiMsg));
      }
    });
    
    // Filter and sort messages
    const reconciled = Array.from(messageMap.values())
      .filter(msg => {
        // Keep all API messages
        if (apiMsgs.some(apiMsg => apiMsg.id === msg.id)) return true;
        // Keep pending local messages
        if (msg.status === 'sending' && !msg.serverConfirmed) return true;
        return false;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    
    const reconcileTime = performance.now() - startTime;
    
    // Log reconciliation results if there were changes
    if (reconciled.length !== localMessages.length) {
      log.debug('Message reconciliation completed', {
        previousCount: localMessages.length,
        newCount: reconciled.length,
        timeMs: Math.round(reconcileTime),
        sessionId: sessionIdRef.current
      });
    }
    
    return reconciled;
  }, []);

  // Sync with API messages without throttling for immediate updates
  useEffect(() => {
    if (!isClient || !isInitialized) return;
    
    // No throttling - perform reconciliation immediately
    const startTime = performance.now();
    
    log.debug('Starting API message sync', {
      apiCount: apiMessages.length,
      localCount: messages.length,
      sessionId: sessionIdRef.current
    });
    
    const reconciled = reconcileMessages(messages, apiMessages);
    
    // Only update if there are actual changes
    if (JSON.stringify(reconciled) !== JSON.stringify(messages)) {
      setMessages(reconciled);
      
      // Update store if we have a conversation ID
      if (localCurrentConversationId) {
        updateMessages(localCurrentConversationId, apiMessages);
      }
      
      const syncTime = performance.now() - startTime;
      log.debug('Message sync completed', {
        timeMs: Math.round(syncTime),
        messageCount: reconciled.length,
        sessionId: sessionIdRef.current
      });
    }
  }, [apiMessages, isClient, isInitialized, messages, reconcileMessages, localCurrentConversationId, updateMessages]);
  
  // Initialize conversation ID from store when component mounts
  useEffect(() => {
    if (isClient && !localCurrentConversationId && storeConversationId) {
      log.debug('Initializing conversation ID from store', {
        storeConversationId,
        sessionId: sessionIdRef.current
      });
      setLocalCurrentConversationId(storeConversationId);
    }
  }, [isClient, localCurrentConversationId, storeConversationId]);
  
  // Debug conversation ID changes
  useEffect(() => {
    if (isClient && (
      // Only log when there's an actual change in one of the IDs
      localCurrentConversationId !== previousConversationIdRef.current ||
      // Or on initial setup
      previousConversationIdRef.current === null
    )) {
      log.debug('Conversation ID changed', {
        localCurrentConversationId,
        storeConversationId,
        previousId: previousConversationIdRef.current,
        hasLocalId: !!localCurrentConversationId,
        hasStoreId: !!storeConversationId,
        sessionId: sessionIdRef.current
      });
      
      // Update the ref
      previousConversationIdRef.current = localCurrentConversationId;
    }
  }, [isClient, localCurrentConversationId, storeConversationId]);
  
  // Track when streaming starts and ends
  useEffect(() => {
    if (apiIsLoading !== isLoading) {
      setIsLoading(apiIsLoading);
      
      if (apiIsLoading) {
        // Streaming started
        log.debug('Streaming started');
        lastMessageTimestamp.current = Date.now();
        
        // Reset stream metrics
        streamMetrics.current = {
          startTime: Date.now(),
          chunkCount: 0,
          lastChunkTime: Date.now(),
          totalChunks: 0
        };
      } else if (lastMessageTimestamp.current) {
        // Streaming ended
        const streamTime = Date.now() - lastMessageTimestamp.current;
        log.debug('Streaming completed', { 
          streamTimeMs: streamTime,
          chunkCount: streamMetrics.current.chunkCount
        });
      }
    }
  }, [apiIsLoading, isLoading]);
  
  // Original sendMessage implementation
  const sendMessage = useCallback(async (
    input: string,
    options: { role?: 'user' | 'assistant' | 'system' } = { role: 'user' }
  ) => {
    // Skip empty messages
    if (!input.trim()) {
      log.warn('Attempted to send empty message');
      return;
    }
    
    const messageId = uuidv4();
    const startTime = performance.now();
    
    log.debug('Preparing to send message', { 
      messageId,
      messageLength: input.length,
      inputContent: input.substring(0, 20) + (input.length > 20 ? '...' : ''), // Log first 20 chars for debugging
      role: options.role,
      sessionId: sessionIdRef.current,
      conversationId: localCurrentConversationId || storeConversationId
    });
    
    // Create conversation if needed
    let conversationId = localCurrentConversationId;
    if (!conversationId) {
      // Check if we have one in the store first
      if (storeConversationId) {
        conversationId = storeConversationId;
        log.debug('Using existing conversation from store', { id: conversationId });
        setLocalCurrentConversationId(conversationId);
      } else {
        // Create a new conversation
        const createdConversationId = createConversation();
        log.info('Created new conversation', { 
          id: createdConversationId,
          messageId 
        });
        conversationId = createdConversationId;
        setLocalCurrentConversationId(createdConversationId);
      }
    }
    
    // Create message
    const message: ApiMessage = {
      id: messageId,
      content: input.trim(),
      role: options.role || 'user',
    };
    
    // Add local message
    const localMessage = enhanceMessage(message, 'sending', false);
    setMessages(prev => {
      const newMessages = [...prev, localMessage];
      log.debug('Added local message', {
        messageId,
        totalMessages: newMessages.length,
        pendingMessages: newMessages.filter(m => !m.serverConfirmed).length
      });
      return newMessages;
    });
    
    try {
      await originalAppend(message);
      
      const sendTime = performance.now() - startTime;
      log.info('Message sent successfully', { 
        messageId,
        responseTimeMs: Math.round(sendTime)
      });
      
      if (conversationId) {
        addMessage(message);
      }
      
      return message;
    } catch (err) {
      const errorTime = performance.now() - startTime;
      log.error('Failed to send message', {
        error: err instanceof Error ? err.message : String(err),
        messageId,
        attemptDurationMs: Math.round(errorTime)
      });
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'error' } 
          : msg
      ));
      
      throw err;
    }
  }, [originalAppend, localCurrentConversationId, storeConversationId, createConversation, addMessage]);
  
  // Handle form submission with enhanced logging
  const handleEnhancedSubmit = useCallback(async (
    e: React.FormEvent<HTMLFormElement>,
    options?: { data?: Record<string, any> }
  ) => {
    try {
      e.preventDefault();
      
      // Extract input value from the form
      const formElement = e.target as HTMLFormElement;
      const inputElement = formElement.querySelector('input') as HTMLInputElement;
      const inputValue = inputElement?.value || '';
      
      log.debug('Form submission initiated', {
        hasInput: !!inputValue,
        inputLength: inputValue?.length || 0,
        agentType: key,
        conversationId: localCurrentConversationId
      });
      
      // If there's input, send it directly
      if (inputValue && inputValue.trim()) {
        await sendMessage(inputValue, { role: 'user' });
        return;
      }
      
      // Fallback to original handler
      return await handleSubmit(e);
    } catch (err) {
      log.error('Error submitting form', {
        error: err instanceof Error ? err.message : String(err),
        conversationId: localCurrentConversationId,
        sessionId: sessionIdRef.current
      });
      throw err;
    }
  }, [handleSubmit, key, localCurrentConversationId, sendMessage]);
  
  // Add message state debugging
  useEffect(() => {
    if (!isClient || !isInitialized) return;
    
    log.debug('Message state updated', {
      apiMessageCount: apiMessages.length,
      localMessageCount: messages.length,
      pendingMessages: messages.filter(m => !m.serverConfirmed).length,
      hasError: messages.some(m => m.status === 'error'),
      sessionId: sessionIdRef.current,
      conversationId: localCurrentConversationId
    });
  }, [apiMessages, messages, isClient, isInitialized, localCurrentConversationId]);
  
  // Reset the chat history
  const resetChat = useCallback(() => {
    const startTime = performance.now();
    log.info('Resetting chat');
    
    // Reset AI SDK state - use reload() instead of reset()
    originalReload();
    
    // Clear local messages
    setMessages([]);
    
    // Clear conversation in store if we have one
    if (localCurrentConversationId) {
      clearConversation();
    }
    
    // Reset conversation ID
    setLocalCurrentConversationId(null);
    previousConversationIdRef.current = null;
    
    // Reset initialization state
    setIsInitialized(false);
    initializedRef.current = false;
    
    // Reset API messages
    setApiMessages([]);
    
    const resetTime = performance.now() - startTime;
    log.debug('Chat reset complete', { resetTimeMs: Math.round(resetTime) });
  }, [originalReload, localCurrentConversationId, clearConversation, setApiMessages]);
  
  // Track stream chunks
  const trackStreamChunk = useCallback(() => {
    const metrics = streamMetrics.current;
    metrics.chunkCount++;
    metrics.totalChunks++;
    
    const now = Date.now();
    const timeSinceLastChunk = now - metrics.lastChunkTime;
    metrics.lastChunkTime = now;
    
    // Log every 5th chunk to avoid excessive logging
    if (metrics.chunkCount % 5 === 0) {
      log.debug('Stream chunk received', {
        chunkCount: metrics.chunkCount,
        timeSinceLastChunk,
        totalChunks: metrics.totalChunks,
        elapsedTime: now - metrics.startTime
      });
    }
  }, []);
  
  return {
    // Messages and input
    messages,
    input: localInput,
    handleInputChange: handleApiInputChange,
    setInput: setApiInput,
    
    // Actions
    handleSubmit: handleEnhancedSubmit,
    sendMessage,
    reset: resetChat,
    reload: originalReload,
    loadConversation,
    stop,
    
    // Status
    isLoading,
    error: apiError,
    
    // Meta information
    sessionId,
    currentConversationId: localCurrentConversationId,
    setCurrentConversationId: setLocalCurrentConversationId,
    
    // Original AI SDK functions
    append: originalAppend
  };
} 