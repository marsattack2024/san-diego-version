import React, { useState, useEffect, useRef } from 'react';
import { Message } from 'ai';
import { X, Send, MessageSquare, AlertCircle, RefreshCw, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateSessionId } from '@/lib/widget/session';
import {
  ChatWidgetConfig,
  ChatWidgetSession,
  POSITION_STYLES,
  DEFAULT_CONFIG
} from './types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getSession,
  saveSession,
  addMessageToSession,
  clearSession
} from '@/lib/widget/session';

interface ChatWidgetProps {
  config?: Partial<ChatWidgetConfig>
}

// Extended Message type with additional properties for UI state
interface ExtendedMessage extends Message {
  status?: 'pending' | 'complete' | 'error';
  errorType?: 'timeout' | 'rate-limit' | 'connection' | 'server' | 'unknown';
  timestamp?: string;
}

export function ChatWidget({ config = {} }: ChatWidgetProps) {
  // Merge default config with provided config
  const widgetConfig = { ...DEFAULT_CONFIG, ...config }

  // Widget state
  const [isOpen, setIsOpen] = useState(false)
  const [session, setSession] = useState<ChatWidgetSession | null>(null)
  const [messages, setMessages] = useState<ExtendedMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    limited: boolean;
    retryAfter?: number;
    resetAt?: number;
  }>({ limited: false })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Initialize session on mount
  useEffect(() => {
    const currentSession = getSession()
    setSession(currentSession)

    // Load messages from session
    if (currentSession?.messages?.length) {
      setMessages(currentSession.messages as ExtendedMessage[])
    }
  }, [])

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen])

  // Focus input when opening the widget
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  // Handle rate limit reset
  useEffect(() => {
    let timerId: NodeJS.Timeout;

    if (rateLimitInfo.limited && rateLimitInfo.resetAt) {
      const checkRateLimit = () => {
        const now = Date.now();
        if (now >= (rateLimitInfo.resetAt || 0)) {
          setRateLimitInfo({ limited: false });
        } else {
          timerId = setTimeout(checkRateLimit, 1000);
        }
      };

      timerId = setTimeout(checkRateLimit, 1000);
    }

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [rateLimitInfo]);

  const formatErrorMessage = (status: number, responseBody?: any): string => {
    switch (status) {
      case 429:
        const retryAfter = responseBody?.retryAfter || 60;
        const resetTime = new Date(Date.now() + retryAfter * 1000).toLocaleTimeString();
        setRateLimitInfo({
          limited: true,
          retryAfter,
          resetAt: Date.now() + retryAfter * 1000
        });
        return `Rate limit exceeded. Please try again after ${resetTime}.`;
      case 504:
        return "Sorry, the request timed out. Please try a shorter or simpler question.";
      case 503:
        return "The service is currently unavailable. Please try again later.";
      case 500:
        return "There was a server error. Our team has been notified.";
      case 0:
        return "Connection lost. Please check your internet connection.";
      default:
        return "Something went wrong. Please try again later.";
    }
  };

  // Send message to API
  const sendMessage = async (content: string, isRetry = false, messageIdToRetry?: string) => {
    if (!content.trim() || !session) return;

    // If we're already at rate limit, show message and return
    if (rateLimitInfo.limited) {
      const resetTime = new Date(rateLimitInfo.resetAt || 0).toLocaleTimeString();
      setError(new Error(`Please wait until ${resetTime} before sending more messages.`));
      setTimeout(() => setError(null), 5000);
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create a new abort controller for this request
    abortControllerRef.current = new AbortController();

    // Create new user message
    const userMessage: ExtendedMessage = isRetry && messageIdToRetry
      ? messages.find(m => m.id === messageIdToRetry) as ExtendedMessage || {
        id: messageIdToRetry || Date.now().toString(),
        role: 'user',
        content,
        status: 'pending'
      }
      : {
        id: Date.now().toString(),
        role: 'user',
        content,
        status: 'pending'
      };

    // If retrying, update existing message status
    if (isRetry && messageIdToRetry) {
      setMessages(prev => prev.map(msg =>
        msg.id === messageIdToRetry
          ? { ...msg, status: 'pending' }
          : msg
      ));

      // Remove any error message that followed this one
      setMessages(prev => {
        const msgIndex = prev.findIndex(msg => msg.id === messageIdToRetry);
        if (msgIndex >= 0 && msgIndex < prev.length - 1 &&
          prev[msgIndex + 1].role === 'assistant' &&
          prev[msgIndex + 1].status === 'error') {
          return [...prev.slice(0, msgIndex + 1), ...prev.slice(msgIndex + 2)];
        }
        return prev;
      });
    } else {
      // Update UI with new message
      setMessages(prev => [...prev, userMessage]);
    }

    setInput('');
    setIsLoading(true);
    setError(null);

    // Update session with user message
    const updatedSession = addMessageToSession(session, userMessage);
    setSession(updatedSession);

    // Log what we're sending (for debugging)
    console.log('Sending message to API:', {
      message: content,
      sessionId: session.id
    });

    try {
      // Prepare request with timeout
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort('timeout');
        }
      }, 30000); // 30 second timeout

      const response = await fetch('/api/widget-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content,
          sessionId: session.id
        }),
        signal: abortControllerRef.current.signal,
      });

      clearTimeout(timeoutId);

      // Check for rate limiting headers
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      if (rateLimitRemaining === '0' && rateLimitReset) {
        setRateLimitInfo({
          limited: true,
          resetAt: parseInt(rateLimitReset)
        });
      }

      // Handle response based on status
      if (!response.ok && response.status !== 200) {
        let errorData = { error: 'Unknown error', message: 'Something went wrong', retryAfter: 60 };

        try {
          errorData = await response.json();
        } catch (e) {
          // If response is not JSON, use default error
        }

        const errorMessage = formatErrorMessage(response.status, errorData);

        // Update the user message to show error
        setMessages(prev => prev.map(msg =>
          msg.id === userMessage.id
            ? { ...msg, status: 'error', errorType: response.status === 429 ? 'rate-limit' : 'server' }
            : msg
        ));

        // Add assistant error message
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: errorMessage,
            id: `error-${Date.now()}`,
            status: 'error',
            errorType: response.status === 429 ? 'rate-limit' : 'server'
          }
        ]);

        setIsLoading(false);
        abortControllerRef.current = null;
        return;
      }

      // Handle the actual response content
      if (!response.body) {
        throw new Error('Response body is empty');
      }

      // Mark the user message as complete
      setMessages(prev => prev.map(msg =>
        msg.id === userMessage.id
          ? { ...msg, status: 'complete' }
          : msg
      ));

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialResponse = '';

      // Create a temporary message for streaming
      const tempMessageId = `assistant-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          id: tempMessageId,
          status: 'pending'
        }
      ]);

      // Reset retry count on successful response start
      setRetryCount(0);

      // Process the streaming response
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Mark the assistant message as complete
          setMessages(prev => prev.map(msg =>
            msg.id === tempMessageId
              ? { ...msg, status: 'complete' }
              : msg
          ));
          break;
        }

        // Decode and append to partial response
        partialResponse += decoder.decode(value, { stream: true });

        // Update the message
        setMessages(prev => prev.map(msg =>
          msg.id === tempMessageId
            ? { ...msg, content: partialResponse }
            : msg
        ));
      }

      // Complete the response with final decode
      const finalChunk = decoder.decode();
      if (finalChunk) {
        partialResponse += finalChunk;
      }

      // Final update to the message content
      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId
          ? { ...msg, content: partialResponse, status: 'complete' }
          : msg
      ));

      // Update session with assistant message
      const assistantMessage: ExtendedMessage = {
        id: tempMessageId,
        role: 'assistant',
        content: partialResponse,
        status: 'complete'
      };

      const sessionWithResponse = addMessageToSession(updatedSession, assistantMessage);
      setSession(sessionWithResponse);

    } catch (err: any) {
      console.error('Error sending message:', err);

      // Determine error type and message
      let errorType: ExtendedMessage['errorType'] = 'unknown';
      let errorMessage = "Something went wrong. Please try again.";

      if (err.name === 'AbortError') {
        if (err.message === 'timeout') {
          errorType = 'timeout';
          errorMessage = "The request timed out. Please try a shorter or simpler question.";
        } else {
          // User cancelled or aborted
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          setIsLoading(false);
          abortControllerRef.current = null;
          return;
        }
      } else if (err.message === 'Failed to fetch' || err.message?.includes('Network')) {
        errorType = 'connection';
        errorMessage = "Connection error. Please check your internet connection and try again.";
      }

      // Update the user message status
      setMessages(prev => prev.map(msg =>
        msg.id === userMessage.id
          ? { ...msg, status: 'error', errorType }
          : msg
      ));

      // Add error message from assistant
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: errorMessage,
          id: `error-${Date.now()}`,
          status: 'error',
          errorType
        }
      ]);

      setError(new Error(errorMessage));
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Handle retry for failed messages
  const handleRetry = (messageId: string) => {
    // Find the message to retry
    const messageToRetry = messages.find(msg => msg.id === messageId);
    if (!messageToRetry) return;

    // Check retry count
    if (retryCount >= 3) {
      setError(new Error("Too many retry attempts. Please try a different question."));
      setTimeout(() => setError(null), 5000);
      return;
    }

    setRetryCount(prev => prev + 1);
    sendMessage(messageToRetry.content, true, messageId);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Reset the chat
  const handleReset = () => {
    clearSession();
    const newSession = getSession();
    setSession(newSession);
    setMessages([]);
    setRetryCount(0);
    setRateLimitInfo({ limited: false });
  };

  // Toggle the widget open/closed
  const toggleWidget = () => {
    setIsOpen(prev => !prev);
  };

  // Position styles based on config
  const positionStyle = POSITION_STYLES[widgetConfig.position || 'bottom-right'];

  // Dynamic styles
  const primaryColorStyle = widgetConfig.primaryColor
    ? { '--widget-primary-color': widgetConfig.primaryColor } as React.CSSProperties
    : {};

  // Combine all styles
  const widgetStyle = {
    ...positionStyle,
    ...primaryColorStyle,
  };

  return (
    <div
      className="fixed z-50 font-sans"
      style={widgetStyle}
    >
      {/* Chat bubble */}
      {!isOpen && (
        <button
          className="flex items-center justify-center w-14 h-14 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-300"
          style={{ backgroundColor: widgetConfig.primaryColor || '#0070f3' }}
          onClick={toggleWidget}
          aria-label="Open chat widget"
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          className="flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden transition-all duration-300 animate-in fade-in-50 slide-in-from-bottom-10"
          style={{
            width: `${widgetConfig.width}px`,
            height: `${widgetConfig.height}px`
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{ backgroundColor: widgetConfig.primaryColor || '#0070f3' }}
          >
            <h3 className="font-medium text-white">
              {widgetConfig.title || 'Chat Widget'}
            </h3>
            <button
              className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
              onClick={toggleWidget}
              aria-label="Close chat widget"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea
            className="flex-1 p-4 overflow-y-auto"
            ref={scrollRef}
          >
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500">
                  {widgetConfig.greeting || "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?"}
                </p>
              </div>
            )}

            {/* Chat messages */}
            <div className="space-y-4">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={cn(
                    "flex max-w-[80%] rounded-lg p-3",
                    message.role === 'user'
                      ? "ml-auto bg-blue-100 text-gray-800"
                      : "bg-gray-100 text-gray-800",
                    message.status === 'error' ? "border border-red-300" : ""
                  )}
                >
                  <div className="w-full">
                    <p className="whitespace-pre-wrap text-sm break-words">
                      {message.content}
                    </p>

                    {/* Retry button for error messages */}
                    {message.role === 'user' && message.status === 'error' && (
                      <button
                        onClick={() => handleRetry(message.id)}
                        className="mt-2 text-xs flex items-center text-gray-500 hover:text-gray-700"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex max-w-[80%] rounded-lg p-3 bg-gray-100">
                  <p className="text-gray-500 flex items-center">
                    <Loader className="w-3 h-3 mr-2 animate-spin" />
                    Thinking...
                  </p>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex max-w-[80%] rounded-lg p-3 bg-red-100 text-red-800">
                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error.message || "Something went wrong"}</p>
                </div>
              )}

              {/* Rate limit message */}
              {rateLimitInfo.limited && (
                <div className="flex max-w-[80%] rounded-lg p-3 bg-yellow-100 text-yellow-800">
                  <p className="text-sm">
                    Rate limit reached. Try again at {new Date(rateLimitInfo.resetAt || 0).toLocaleTimeString()}.
                  </p>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="p-4 border-t">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                placeholder={widgetConfig.placeholder || "Type your message..."}
                className="resize-none min-h-[60px] max-h-[120px] flex-1"
                rows={1}
                maxLength={500}
                disabled={isLoading || rateLimitInfo.limited}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const form = e.currentTarget.form
                    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
                  }
                }}
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim() || rateLimitInfo.limited}
                className="self-end"
                style={{
                  backgroundColor: widgetConfig.primaryColor || '#0070f3',
                  color: 'white'
                }}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {/* Reset button */}
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Reset conversation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
} 