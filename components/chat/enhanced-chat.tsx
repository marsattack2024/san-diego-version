'use client';

import { useState, Suspense, lazy, useRef, useEffect, useCallback, useMemo } from 'react';
import { useEnhancedChat } from '@/hooks/useEnhancedChat';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Agent } from '@/types/chat';
import { defaultAgent } from '@/config/agents';
import { ChatHistoryDropdown } from './chat-history-dropdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsClient } from '@/hooks/useIsClient';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar } from '@/components/ui/avatar';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '@/stores/chat-store';
import { useChat } from 'ai/react';
import { Message } from 'ai';
import { createLogger } from '@/utils/client-logger';
import { businessEvents } from '@/utils/client-logger';
import { ErrorBoundary } from '@/components/error-boundary';
import { NewChatButton } from './new-chat-button';
import { useUserId } from '@/utils/user-id';

// Create logger for this component
const log = createLogger('EnhancedChat');

// Lazy load components that aren't needed immediately
const AgentSelector = lazy(() => import('./agent-selector').then(mod => ({ default: mod.AgentSelector })));
const DeepSearchToggle = lazy(() => import('./deep-search-toggle').then(mod => ({ default: mod.DeepSearchToggle })));

export interface EnhancedChatProps {
  apiEndpoint: string;
  onRegisterLoadConversation?: (fn: (conversationId: string) => void) => void;
  className?: string;
}

export function EnhancedChat({ 
  apiEndpoint = '/api/chat',
  onRegisterLoadConversation,
  className = ''
}: EnhancedChatProps) {
  const isClient = useIsClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent>(defaultAgent);
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Debug state for tracking resets
  const resetCountRef = useRef(0);
  const [debugInfo, setDebugInfo] = useState<{ lastReset: string }>({ lastReset: 'Never' });
  
  // Use a ref for the chat key to avoid re-renders
  const chatKeyRef = useRef<string>(uuidv4());
  
  // Get current conversation ID from store for debugging
  const storeConversationId = useChatStore(state => state.currentConversationId);
  
  // Use the enhanced chat hook
  const chat = useEnhancedChat({
    api: apiEndpoint,
    key: selectedAgent.id, // Use agent ID as key to reset chat when agent changes
    body: {
      agent: selectedAgent.id,
      deepSearch: deepSearchEnabled
    },
    onError: (err) => {
      log.error('Chat error', {
        error: err.message,
        agent: selectedAgent.id,
        conversationId: storeConversationId
      });
      
      // Track error in analytics
      businessEvents.errorOccurred(
        userId,
        'chat',
        err.message,
        selectedAgent.id
      );
    }
  });
  
  // Use default values if chat hook returns undefined
  const messages = chat?.messages || [];
  const isLoading = chat?.isLoading || false;
  const error = chat?.error;
  const handleSubmit = chat?.handleSubmit;
  const handleInputChange = chat?.handleInputChange;
  const chatCurrentConversationId = chat?.currentConversationId;
  const setConversationId = chat?.setCurrentConversationId;
  const loadConversationFn = chat?.loadConversation;
  const chatSessionId = typeof chat?.sessionId === 'function' ? chat.sessionId() : '';
  
  // Local state for input
  const [input, setInput] = useState('');
  const hasMessages = messages.length > 0;
  
  // Use the centralized user ID hook instead of local implementation
  const userId = useUserId();
  
  // Track message count changes
  const messagesCountRef = useRef(messages.length);
  
  // Track prev message count and loading state for comparison
  const prevMessageCountRef = useRef(messages.length || 0);
  const prevLoadingStateRef = useRef(isLoading);
  // Track session and conversation IDs for comparison
  const sessionIdRef = useRef('');
  const conversationIdRef = useRef<string | null>(null);
  
  // Log session ID and conversation ID changes for debugging
  useEffect(() => {
    if (isClient) {
      // Store last values for comparison
      const lastSessionId = sessionIdRef.current;
      const lastConversationId = conversationIdRef.current;
      
      // Update refs with current values
      sessionIdRef.current = chatSessionId;
      conversationIdRef.current = storeConversationId;
      
      // Only log if something actually changed
      if (
        lastSessionId !== chatSessionId || 
        lastConversationId !== storeConversationId ||
        // Always log on first render
        (lastSessionId === '' && lastConversationId === null)
      ) {
        log.debug('Active session and conversation', { 
          sessionId: chatSessionId, 
          currentConversationId: storeConversationId,
          messageCount: messages.length || 0 
        });
      }
    }
  }, [chatSessionId, storeConversationId, isClient, messages.length]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    const startTime = performance.now();
    if (messagesEndRef.current && isClient) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      const scrollTime = performance.now() - startTime;
      
      // Only log if it took significant time (>50ms)
      if (scrollTime > 50) {
        log.debug('Scrolled to bottom', { scrollTimeMs: Math.round(scrollTime) });
      }
    }
  }, [messages, isClient]);
  
  // Register the loadConversation function with the parent component
  useEffect(() => {
    if (onRegisterLoadConversation && loadConversationFn) {
      log.info('Registering loadConversation function');
      onRegisterLoadConversation(loadConversationFn);
    }
  }, [onRegisterLoadConversation, loadConversationFn]);
  
  // Track accessibility interactions
  const handleMessagesFocus = useCallback(() => {
    log.debug('Screen reader focus on messages', {
      messageCount: messages.length,
      conversationId: storeConversationId
    });
  }, [messages.length, storeConversationId]);
  
  const handleInputFocus = useCallback(() => {
    log.debug('Focus on chat input', {
      conversationId: storeConversationId
    });
  }, [storeConversationId]);
  
  // Track message count changes
  useEffect(() => {
    if (messages.length !== messagesCountRef.current) {
      log.debug('Message count changed', {
        previousCount: messagesCountRef.current,
        newCount: messages.length,
        conversationId: storeConversationId,
        sessionId: chatSessionId
      });
      messagesCountRef.current = messages.length;
    }
  }, [messages.length, storeConversationId, chatSessionId]);

  // Enhanced logging for state changes
  useEffect(() => {
    // Use a debounced version to avoid excessive logging
    // Only log significant state changes rather than every update
    const significantChange = 
      // First render
      (messagesCountRef.current === 0 && messages.length === 0) ||
      // Message count changed
      (messagesCountRef.current !== messages.length) ||
      // Loading state changed
      (prevLoadingStateRef.current !== isLoading);
    
    // Store current loading state for comparison
    prevLoadingStateRef.current = isLoading;
    
    if (significantChange) {
      log.debug('Chat state updated', {
        hasMessages,
        isLoading,
        conversationId: storeConversationId,
        sessionId: chatSessionId,
        messageCount: messages.length
      });
    }
  }, [hasMessages, isLoading, storeConversationId, chatSessionId, messages.length]);
  
  // Handle form submission
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      if (!input.trim() || isLoading) return;
      
      try {
        // Log message submission before making the API call
        log.info('User submitting message', {
          inputLength: input.length,
          agent: selectedAgent.id,
          conversationId: storeConversationId,
          timestamp: new Date().toISOString()
        });
        
        // Track message in analytics
        businessEvents.messageSent(
          userId,
          input.length,
          selectedAgent.id
        );
        
        // Submit the message
        if (handleSubmit) {
          // Make sure the input value is in the form when submitting
          const formElement = e.currentTarget;
          const inputElement = formElement.querySelector('input[data-chat-input="true"]');
          if (inputElement instanceof HTMLInputElement) {
            inputElement.value = input;
          }
          
          await handleSubmit(e);
        }
        
        // Clear input after sending
        setInput('');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error('Error submitting message', { error: errorMessage });
      }
    },
    [input, isLoading, handleSubmit, userId, selectedAgent.id, storeConversationId]
  );
  
  const handleNewChat = useCallback(() => {
    // Increment reset counter for debugging
    resetCountRef.current += 1;
    const timestamp = new Date().toISOString();
    
    log.info('Starting new chat', { 
      resetCount: resetCountRef.current,
      timestamp
    });
    
    // Log business event for new chat started
    businessEvents.chatStarted(userId, selectedAgent.id);
    
    // Use the NewChatButton component's functionality instead
    // This will be handled by the NewChatButton component
    // We're keeping this function for backward compatibility
    
    // Find and click the NewChatButton to ensure consistent behavior
    if (typeof document !== 'undefined') {
      const newChatButton = document.querySelector('[data-new-chat-button="true"]');
      if (newChatButton instanceof HTMLElement) {
        newChatButton.click();
        return; // Let the NewChatButton handle the rest
      }
    }
    
    // Fallback if the button isn't found
    // Clear URL parameters first to avoid regenerating the last query
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
    
    // Generate a completely new UUID for the chat key
    const newKey = uuidv4();
    chatKeyRef.current = newKey;
    log.debug('Generated new chat key', { newKey });
    
    // Reset the chat - this creates a new conversation in the store
    setConversationId(null);
    
    // Clear input field when starting a new chat
    setInput('');
    
    // Force a re-render with the new key
    setDebugInfo({ lastReset: timestamp });
    
    // Force a complete remount of the component by changing the key
    // This is a more aggressive approach to ensure all state is reset
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        // Force reload the page without using the cache
        window.location.href = window.location.pathname;
      }
    }, 100);
  }, [setConversationId, selectedAgent.id]);
  
  // Handle agent selection
  const handleAgentChange = (agent: Agent) => {
    log.info('Agent changed', { 
      from: selectedAgent.id, 
      to: agent.id 
    });
    setSelectedAgent(agent);
  };
  
  // Handle deep search toggle
  const handleDeepSearchToggle = (enabled: boolean) => {
    log.info('Deep search setting changed', { enabled });
    setDeepSearchEnabled(enabled);
  };
  
  // Render a minimal placeholder during SSR to prevent hydration mismatches
  if (!isClient) {
    return <div className={cn("flex flex-col h-full", className)} />;
  }
  
  return (
    <ErrorBoundary componentName="EnhancedChat">
      <div 
        className={cn(
          "flex flex-col h-full transition-all duration-300 bg-gradient-to-b from-slate-50 to-white",
          className
        )}
      >
        {/* Header with title and reset button */}
        <div className="p-4 border-b bg-white/80 backdrop-blur-sm">
          <div className="flex justify-between items-center max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="font-bold text-lg">AI Chat</div>
              {process.env.NODE_ENV !== 'production' && (
                <div className="text-xs text-muted-foreground ml-2">
                  Session: {chatSessionId?.substring(0, 8) || 'unknown'} 
                  {debugInfo.lastReset !== 'Never' && ` (Last Reset: ${debugInfo.lastReset})`}
                  {storeConversationId && ` | Conv: ${storeConversationId.substring(0, 6)}`}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ChatHistoryDropdown />
              <NewChatButton />
            </div>
          </div>
        </div>

        {/* Chat area - using a consistent layout with inner content changing */}
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-4">
            <div className={cn(
              "w-full h-full flex flex-col",
              hasMessages ? "" : "items-center justify-center"
            )}>
              {!hasMessages && !isLoading ? (
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground max-w-2xl mx-auto">
                  <div className="mb-4 text-5xl">✨</div>
                  <h3 className="text-2xl font-semibold mb-2 text-foreground">Welcome to AI Chat</h3>
                  <p className="max-w-md mb-8 text-slate-500">
                    Start a conversation with {selectedAgent.name}. Ask anything or request help with a task.
                  </p>
                  <div className="max-w-md w-full">
                    <Card className="shadow-md border-slate-200 overflow-hidden">
                      <CardContent className="p-4">
                        <p className="text-sm font-medium mb-3 text-slate-700">Try asking:</p>
                        <div className="space-y-2">
                          {["What can you help me with?", "Tell me about this project", "How do I use the enhanced chat?"].map((suggestion) => (
                            <Button 
                              key={suggestion} 
                              variant="outline" 
                              className="w-full justify-start text-left h-auto py-3 px-4 text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200"
                              onClick={() => {
                                log.debug('Suggestion selected', { suggestion });
                                setInput(suggestion);
                              }}
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 w-full max-w-4xl mx-auto">
                  {messages.map((message: any) => (
                    <div 
                      key={message.localId}
                      className={cn(
                        "flex items-start gap-3",
                        message.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.role !== 'user' && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                          <Sparkles className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      
                      <div 
                        className={cn(
                          "message p-4 rounded-2xl shadow-sm",
                          message.role === 'user' 
                            ? "bg-primary text-primary-foreground" 
                            : message.role === 'assistant'
                              ? "bg-card border border-slate-200"
                              : "bg-yellow-50 text-yellow-900 italic",
                          message.status === 'error' ? "border border-destructive" : "",
                          message.status === 'sending' ? "opacity-70" : "",
                          "max-w-[80%] inline-block"
                        )}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        
                        {message.status === 'error' && (
                          <div className="text-destructive text-sm mt-2 flex items-center gap-1">
                            Failed to send. 
                            <Button 
                              variant="link"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={() => {
                                log.info('Retrying failed message', { 
                                  messageId: message.id,
                                  messageRole: message.role 
                                });
                                setInput(message.content);
                              }}
                            >
                              Retry
                            </Button>
                          </div>
                        )}
                        
                        {message.status === 'sending' && (
                          <div className="text-muted-foreground text-sm mt-2">Sending...</div>
                        )}
                      </div>
                      
                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                          <div className="text-xs font-medium text-slate-600">You</div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="bg-card border border-slate-200 p-4 rounded-2xl shadow-sm inline-block">
                        <div className="flex items-center gap-2">
                          <div className="text-slate-500">Thinking</div>
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {error && (
                    <div className="bg-destructive/10 p-4 rounded-lg text-destructive flex items-center gap-2">
                      <div className="font-medium">Error:</div> {error.message}
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        
        {/* Input area and controls */}
        <div className="border-t bg-white/80 backdrop-blur-sm">
          <div className="p-4">
            <form onSubmit={handleFormSubmit} className="flex space-x-2 max-w-4xl mx-auto">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isLoading}
                placeholder={`Message ${selectedAgent.name}...`}
                className="flex-1 border-slate-300 focus-visible:ring-primary/50 rounded-full py-6 px-4 shadow-sm"
                data-chat-input="true"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      type="submit" 
                      disabled={isLoading || !input.trim()}
                      className="transition-transform hover:scale-110 rounded-full w-12 h-12 p-0"
                    >
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Send message</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </form>
          </div>
          
          {/* Controls section below input */}
          <div className="px-4 pb-4">
            <div className="flex justify-between items-center max-w-4xl mx-auto">
              <Suspense fallback={<div className="h-8 w-40 bg-slate-100 animate-pulse rounded-full" />}>
                <DeepSearchToggle 
                  enabled={deepSearchEnabled} 
                  onToggle={handleDeepSearchToggle} 
                />
              </Suspense>
              
              <Suspense fallback={<div className="h-8 w-40 bg-slate-100 animate-pulse rounded-full" />}>
                <AgentSelector 
                  selectedAgent={selectedAgent} 
                  onSelectAgent={handleAgentChange} 
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
} 