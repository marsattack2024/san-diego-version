'use client';

import { useChat } from 'ai/react';
import { Message } from 'ai';
import { useRef, Suspense, lazy } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card } from '@/components/ui/card';
import { useChatStore } from '@/stores/chat-store';
import { useIsClient } from '@/hooks/useIsClient';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { Agent } from '@/types/chat';
import { defaultAgent } from '@/config/agents';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@/lib/logger';
import { ensureMessageIds, trimConversationToFitTokenLimit } from '@/lib/message-utils';
import { MessageSkeletonGroup } from './message-skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ErrorDisplay } from '@/components/ui/error-display';
import { ErrorBoundary } from '@/components/chat/error-boundary';
import { categorizeError, logError, ErrorState, getRetryDelay } from '@/lib/error-utils';
import { createLogger } from '@/utils/client-logger';
import { useUserId } from '@/utils/user-id';

// Lazy load components that aren't needed immediately
const AgentSelector = lazy(() => import('./agent-selector').then(mod => ({ default: mod.AgentSelector })));
const DeepSearchToggle = lazy(() => import('./deep-search-toggle').then(mod => ({ default: mod.DeepSearchToggle })));

// Debug logging function
const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const serializedData = data ? JSON.stringify(data, (key, value) => {
        // Handle circular references and complex objects
        if (typeof value === 'object' && value !== null) {
          if (key === 'current' && value.tagName) {
            return `[DOM Element: ${value.tagName}]`;
          }
          // For Date objects, convert to ISO string
          if (value instanceof Date) {
            return value.toISOString();
          }
        }
        return value;
      }) : '';
      
      console.log(`[DEBUG] [ChatInterface] ${message}`, data ? JSON.parse(serializedData) : '');
    } catch (error) {
      console.log(`[DEBUG] [ChatInterface] ${message}`, '[Error serializing data]');
      console.error('Error serializing log data:', error);
    }
  }
};

// Performance measurement with logging
const measurePerformance = (name: string, fn: () => void) => {
  if (process.env.NODE_ENV !== 'production') {
    const start = performance.now();
    try {
      fn();
    } finally {
      const end = performance.now();
      console.log(`[DEBUG] [Performance] ${name}: ${(end - start).toFixed(2)}ms`);
    }
  } else {
    fn();
  }
};

// Add MAX_MESSAGES constant at the top of the file, near other constants
const MAX_MESSAGES = 50; // Maximum number of messages to keep in the conversation

export function ChatInterface() {
  const isClient = useIsClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent>(defaultAgent);
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Get conversation from store
  const {
    conversations, 
    currentConversationId,
    createConversation,
    addMessage, 
    updateMessages 
  } = useChatStore();
  
  // Create a logger for this component
  const log = createLogger('components:chat-interface');
  
  // Use the centralized user ID hook
  const userId = useUserId();
  
  // Create a new conversation if one doesn't exist
  useEffect(() => {
    if (isClient && !currentConversationId) {
      createConversation();
    }
  }, [isClient, currentConversationId, createConversation]);
  
  // Get current conversation messages
  const currentMessages = currentConversationId && conversations[currentConversationId]
    ? conversations[currentConversationId].messages
    : [];
  
  // Initialize chat with the AI SDK
  const { 
    messages: sdkMessages, 
    input: sdkInput, 
    handleInputChange, 
    handleSubmit: aiHandleSubmit, 
    isLoading: sdkIsLoading, 
    append,
    stop,
    reload,
    error: sdkError,
    setMessages: sdkSetMessages
  } = useChat({
    initialMessages: ensureMessageIds(currentMessages),
    id: currentConversationId || undefined,
    body: {
      agent: selectedAgent.id,
      deepSearch: deepSearchEnabled
    },
    api: '/api/chat',
    onResponse: (response) => {
      // Log response headers for debugging
      if (process.env.NODE_ENV === 'development') {
        const responseTime = response.headers.get('X-Response-Time');
        const requestId = response.headers.get('X-Request-ID');
        const contentType = response.headers.get('Content-Type');
        debugLog('Response received', { responseTime, requestId, contentType });
      }
    },
    onFinish: (message) => {
      // Ensure the assistant message has an ID
      const messageWithId = message.id ? message : { ...message, id: uuidv4() };
      debugLog('Chat finished', messageWithId);
      
      // Reset retry count on successful completion
      if (retryCount > 0) {
        setRetryCount(0);
      }
      
      // Clear any error state
      if (errorState) {
        setErrorState(null);
      }
      
      // Update the store with all messages including the final assistant response
      if (currentConversationId) {
        measurePerformance('updateMessages', () => {
          // IMPORTANT: Use the current messages from the UI state, not the store
          // This ensures we include the user message that was added via append()
          sdkSetMessages(ensureMessageIds([...sdkMessages, messageWithId]));
        });
      }
      
      // Scroll to bottom after a short delay to ensure rendering is complete
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          debugLog('Scrolled to bottom');
        }
      }, 100);
    },
    onError: (error) => {
      // Log the error with context
      const context = {
        conversationId: currentConversationId,
        messageCount: sdkMessages.length,
        agent: selectedAgent.id,
        deepSearch: deepSearchEnabled,
        retryCount
      };
      
      const errorInfo = logError(error, context);
      setErrorState(errorInfo);
      
      // Clear any pending retry timeouts
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Auto-retry for network errors, with exponential backoff
      if (errorInfo.type === 'network' && retryCount < 3) {
        const delay = getRetryDelay(retryCount);
        logger.info(`Scheduling auto-retry in ${delay}ms (attempt ${retryCount + 1})`);
        
        retryTimeoutRef.current = setTimeout(() => {
          handleRetry();
        }, delay);
      }
    }
  });
  
  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (messagesEndRef.current && sdkMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sdkMessages]);
  
  // Reset messages if conversation changes
  useEffect(() => {
    if (currentConversationId && conversations[currentConversationId]) {
      const storedMessages = conversations[currentConversationId].messages;
      sdkSetMessages(ensureMessageIds(storedMessages));
    }
  }, [currentConversationId, conversations, sdkSetMessages]);
  
  // Debug log when messages change
  useEffect(() => {
    debugLog(`Messages updated: ${sdkMessages.length} messages`, 
      sdkMessages.map(m => ({ id: m.id, role: m.role, content: m.content.substring(0, 20) + '...' }))
    );
  }, [sdkMessages]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && isClient) {
      const startTime = performance.now();
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      const scrollTime = performance.now() - startTime;
      
      if (scrollTime > 50) {
        log.debug('Scrolled to bottom', { scrollTimeMs: Math.round(scrollTime) });
      }
    }
  }, [sdkMessages, isClient]);
  
  // Log errors
  useEffect(() => {
    if (sdkError) {
      log.error('Chat error occurred', { 
        errorMessage: sdkError.message,
        errorName: sdkError.name,
        errorStack: sdkError.stack,
        timestamp: new Date().toISOString()
      });
    }
  }, [sdkError]);
  
  // Track accessibility interactions
  const handleMessagesFocus = useCallback(() => {
    log.debug('Screen reader focus on messages', {
      messageCount: sdkMessages.length
    });
  }, [sdkMessages.length]);
  
  const handleInputFocus = useCallback(() => {
    log.debug('Focus on chat input');
  }, []);
  
  // Memoize the submit handler to prevent unnecessary re-renders
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    try {
      debugLog('Submitting user message', { input });
      
      // Create a user message with a unique ID
      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        content: input.trim(),
        role: 'user',
        createdAt: new Date()
      };
      
      debugLog('Created user message', userMessage);
      
      // IMPORTANT: Manually append the user message to ensure it appears immediately in the UI
      debugLog('Appending user message to UI state', { messageId: userMessageId });
      
      // This is the critical line that ensures the user message appears in the UI
      append({
        id: userMessageId,
        content: input.trim(),
        role: 'user',
      });
      
      // Also add to our persistent store
      measurePerformance('addMessage', () => {
        addMessage(userMessage);
      });
      
      debugLog('Added message to store', {
        conversationId: currentConversationId,
        messageId: userMessageId
      });
      
      // Verify messages state after append
      debugLog('Current UI messages after append', {
        messageCount: sdkMessages.length + 1, // +1 because state hasn't updated yet
        lastMessage: 'user',
        messageIds: [...sdkMessages, userMessage].map(m => m.id)
      });
      
      // Trim conversation if it's too long
      if (sdkMessages.length > MAX_MESSAGES - 2) {
        const trimmedMessages = sdkMessages.slice(-MAX_MESSAGES + 2);
        debugLog(`Trimmed conversation from ${sdkMessages.length + 1} to ${trimmedMessages.length} messages`);
      }
      
      // NOTE: We're not calling aiHandleSubmit directly anymore
      // Instead, we're using append to add the user message and then manually making the API call
      aiHandleSubmit(e);
      
      // Scroll to bottom after a short delay to ensure the message is rendered
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        debugLog('Scrolled to bottom');
      }, 100);
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      const errorInfo = categorizeError(error);
      setErrorState(errorInfo);
    }
  }, [input, isLoading, currentConversationId, sdkMessages, addMessage, append, aiHandleSubmit]);

  // Handle regenerate with proper type
  const handleRegenerate = useCallback(async () => {
    if (reload) {
      await reload();
    }
  }, [reload]);
  
  // Handle retry logic
  const handleRetry = useCallback(() => {
    if (!errorState?.retryable) return;
    
    setErrorState(null);
    setRetryCount(prev => prev + 1);
    
    logger.info(`Retrying after error (attempt ${retryCount + 1})`);
    
    // For the last user message
    const lastUserMessageIndex = [...sdkMessages].reverse().findIndex(m => m.role === 'user');
    if (lastUserMessageIndex >= 0) {
      const lastUserMessage = sdkMessages[sdkMessages.length - 1 - lastUserMessageIndex];
      
      // Use reload() for regenerating the last response
      reload();
    }
  }, [errorState, sdkMessages, reload, retryCount]);
  
  // Dismiss error
  const handleDismissError = useCallback(() => {
    setErrorState(null);
    // Clear any pending retry timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);
  
  // Clean up any timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  if (!isClient) {
    return null;
  }
  
  return (
    <ErrorBoundary componentName="ChatInterface">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          {errorState && (
            <ErrorDisplay 
              error={errorState}
              onRetry={handleRetry}
              onDismiss={handleDismissError}
            />
          )}
          
          <MessageList 
            messages={sdkMessages} 
            isLoading={sdkIsLoading} 
            messagesEndRef={messagesEndRef}
          />
        </div>
        
        <div className="p-4 border-t">
          <div className="relative">
        <ChatInput 
          input={input} 
          isLoading={isLoading} 
          handleInputChange={handleInputChange} 
          handleSubmit={handleSubmit} 
              onStop={stop}
              onRegenerate={handleRegenerate}
              disabled={!!errorState && !errorState.retryable}
            />
            
            <div className="absolute left-2 bottom-2 flex items-center space-x-2">
              <Suspense fallback={null}>
                <AgentSelector 
                  selectedAgent={selectedAgent}
                  onSelectAgent={setSelectedAgent}
                />
                <DeepSearchToggle 
                  enabled={deepSearchEnabled}
                  onToggle={setDeepSearchEnabled}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
} 