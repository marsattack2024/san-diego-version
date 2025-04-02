import { useChat, Message, UseChatOptions } from '@ai-sdk/react';
import { useState, useEffect, useCallback } from 'react';
import { getSession, saveSession, addMessageToSession, clearSession } from '@/lib/widget/session';

export interface UseAppChatOptions extends UseChatOptions {
    chatType?: 'standard' | 'widget';
    initialSessionId?: string;
    apiPath?: string;
    debugMode?: boolean;
    onError?: (error: Error) => void;
}

/**
 * A wrapper around the Vercel AI SDK's useChat hook that adds session management
 * and rate limiting capabilities specifically for our application.
 */
export function useAppChat({
    chatType = 'widget',
    initialSessionId,
    apiPath,
    debugMode = false,
    ...options
}: UseAppChatOptions = {}) {
    // Determine the API path based on chat type
    const api = apiPath || (chatType === 'widget' ? '/api/widget-chat' : '/api/chat');

    // Session management
    const [sessionId, setSessionId] = useState<string>(initialSessionId || '');
    const [rateLimitInfo, setRateLimitInfo] = useState<{
        limited: boolean;
        retryAfter?: number;
        resetAt?: number;
    }>({ limited: false });

    // Track retry attempts
    const [retryCount, setRetryCount] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);

    // Initial API warmup
    useEffect(() => {
        const warmupAPI = async () => {
            try {
                // Make a ping request to warm up the API
                if (debugMode) console.log('Warming up widget API...');
                const pingUrl = `${api}?ping=true`;
                const response = await fetch(pingUrl, {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache, no-store',
                        'Pragma': 'no-cache'
                    }
                });

                if (response.ok) {
                    if (debugMode) console.log('API warmup successful');
                } else {
                    console.warn('API warmup received error response', response.status);
                }
            } catch (error) {
                // Silent fail - if ping fails, the first message will just be slower
                if (debugMode) console.warn('API warmup failed', error);
            }
        };

        warmupAPI();
    }, [api, debugMode]);

    // Initialize session on mount
    useEffect(() => {
        if (!sessionId) {
            const currentSession = getSession();
            setSessionId(currentSession.id);

            // If there are messages in the session, we'll load them later
            if (options.initialMessages === undefined && currentSession.messages?.length) {
                // We don't set initialMessages here because useChat is already initialized
                // Instead we'll use setMessages after the hook is set up
            }
        }
    }, [sessionId, options.initialMessages]);

    // Get the base chat functionality from Vercel AI SDK
    const chatHelpers = useChat({
        api,
        id: sessionId || undefined,
        initialMessages: options.initialMessages,
        body: {
            sessionId
        },
        onResponse: async (response) => {
            // Check for rate limiting headers
            const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
            const rateLimitReset = response.headers.get('X-RateLimit-Reset');

            if (rateLimitRemaining === '0' && rateLimitReset) {
                setRateLimitInfo({
                    limited: true,
                    resetAt: parseInt(rateLimitReset)
                });
            }

            // Track successful responses to reset retry count
            if (response.status >= 200 && response.status < 300) {
                setRetryCount(0);
                setLastError(null);
            }

            // Log response status in debug mode
            if (debugMode) {
                console.log(`API Response: ${response.status} ${response.statusText}`);

                // Try to peek at response content without consuming it
                const clonedResponse = response.clone();
                try {
                    const contentType = response.headers.get('Content-Type') || '';
                    if (contentType.includes('application/json')) {
                        const data = await clonedResponse.json();
                        console.log('Response data:', data);
                    }
                } catch (error) {
                    console.log('Could not preview response data');
                }
            }

            // Call the original onResponse handler if provided
            if (options.onResponse) {
                await options.onResponse(response);
            }
        },
        onFinish: (message, details) => {
            // Save the updated message list to session storage
            if (sessionId) {
                const updatedMessages = [...chatHelpers.messages];
                const session = getSession();
                session.messages = updatedMessages;
                session.lastActiveAt = Date.now();
                saveSession(session);

                if (debugMode) {
                    console.log('Chat session updated', {
                        sessionId,
                        messageCount: updatedMessages.length
                    });
                }
            }

            // Call the original onFinish handler if provided
            if (options.onFinish) {
                options.onFinish(message, details);
            }
        },
        onError: (error) => {
            console.error("Error in chat conversation:", error);
            setLastError(error instanceof Error ? error.message : String(error));

            // Analyze error to provide better diagnostics and recovery options
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Track specific error types
            let errorType = 'unknown';

            // Check for authentication errors (common with widget chat)
            if (
                errorMessage.includes('auth') ||
                errorMessage.includes('unauthorized') ||
                errorMessage.includes('Authentication') ||
                errorMessage.includes('401') ||
                errorMessage.includes('403')
            ) {
                errorType = 'auth';
                if (debugMode) {
                    console.warn('Authentication issue detected in widget chat');
                }
            }
            // Check for connectivity issues
            else if (
                errorMessage.includes('fetch failed') ||
                errorMessage.includes('network') ||
                errorMessage.includes('NetworkError') ||
                errorMessage.includes('Failed to fetch') ||
                errorMessage.includes('timeout')
            ) {
                errorType = 'network';
                if (debugMode) {
                    console.warn('Network connectivity issue detected in widget chat');
                }
            }
            // Parse errors from JSON responses
            else if (errorMessage.includes('SyntaxError') && errorMessage.includes('JSON')) {
                errorType = 'parsing';
                if (debugMode) {
                    console.warn('JSON parsing error in API response - possible malformed response');
                }
            }
            // Cold start errors
            else if (errorMessage.includes('cold start') || errorMessage.includes('initialization')) {
                errorType = 'coldStart';
                if (debugMode) {
                    console.warn('Possible cold start issue detected');
                }
            }

            if (debugMode) {
                console.error(`Chat error type: ${errorType}`, {
                    message: errorMessage,
                    retryCount
                });
            }

            // Call the original onError handler if provided
            if (options.onError) {
                options.onError(error);
            }
        },
        ...options
    });

    // Load messages from session storage if available
    useEffect(() => {
        if (sessionId && chatHelpers.messages.length === 0) {
            const session = getSession();
            if (session.messages?.length) {
                chatHelpers.setMessages(session.messages);
                if (debugMode) {
                    console.log(`Loaded ${session.messages.length} messages from session`);
                }
            }
        }
    }, [sessionId, chatHelpers.setMessages, chatHelpers.messages.length, debugMode]);

    // Retry mechanism for cold start issues
    const retrySubmission = useCallback(async (currentInput: string, options?: any) => {
        if (debugMode) console.log('Attempting to retry submission after API warmup');

        // Increment retry count
        setRetryCount(prev => prev + 1);

        try {
            // For cold start issues, try warming up both the widget-chat endpoint and ping endpoint
            await Promise.allSettled([
                fetch('/api/ping?source=error_recovery', {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' }
                }),
                fetch('/api/widget-chat?ping=true', {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' }
                })
            ]);

            // Wait a moment for the API to initialize, longer for subsequent retries
            const delayMs = Math.min(1000 * (retryCount + 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // Try submitting again with the same input
            if (currentInput.trim()) {
                chatHelpers.setInput(currentInput);
                // We need to create a synthetic event since we don't have the original
                const syntheticEvent = {
                    preventDefault: () => { }
                } as React.FormEvent<HTMLFormElement>;

                await chatHelpers.handleSubmit(syntheticEvent, options);
                return true;
            }
        } catch (retryError) {
            console.error("Failed to recover from error", retryError);
        }
        return false;
    }, [chatHelpers, debugMode, retryCount]);

    // Custom submit handler to check rate limiting before submission
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, options?: any) => {
        e.preventDefault();

        // Check for rate limiting
        if (rateLimitInfo.limited) {
            console.warn("Rate limited - please try again later");
            return;
        }

        // Save the current input to a variable as it will be cleared during submission
        const currentInput = chatHelpers.input;
        const isFirstMessage = chatHelpers.messages.length === 0;

        if (debugMode) {
            console.log(`Submitting message to ${api}`, {
                input: currentInput,
                isFirstMessage,
                sessionId
            });
        }

        try {
            // Use the original submit handler
            await chatHelpers.handleSubmit(e, options);

            // Update the session with the new message
            if (sessionId && currentInput.trim()) {
                const session = getSession();
                // Find the most recent user message that matches our input
                const latestMessage = chatHelpers.messages
                    .filter(m => m.role === 'user')
                    .reverse()
                    .find(m => typeof m.content === 'string' && m.content.includes(currentInput));

                if (latestMessage) {
                    session.messages = chatHelpers.messages;
                    session.lastActiveAt = Date.now();
                    saveSession(session);
                }
            }
        } catch (error) {
            console.error("Error submitting message:", error);

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Detect if this might be a cold start issue
            const isColdStartIssue =
                errorMessage.includes('timeout') ||
                errorMessage.includes('failed') ||
                errorMessage.includes('fetch') ||
                chatHelpers.messages.length <= 1; // First few messages are more likely to be cold start issues

            // Show warning for cold start issues in debug mode
            if (isColdStartIssue && debugMode) {
                console.warn('Possible API cold start issue detected, will attempt recovery...');
            }

            // Attempt recovery for cold start issues or network errors with a maximum of 2 retries
            if ((isColdStartIssue || retryCount < 2) && currentInput) {
                console.log(`Attempting recovery (retry ${retryCount + 1}/3)...`);
                await retrySubmission(currentInput, options);
            }
        }
    };

    // Function to reset the chat (clear all messages)
    const resetChat = useCallback(() => {
        clearSession();
        const newSession = getSession();
        setSessionId(newSession.id);
        chatHelpers.setMessages([]);
        chatHelpers.setInput('');

        if (debugMode) {
            console.log('Chat session reset, new sessionId:', newSession.id);
        }
    }, [chatHelpers, debugMode]);

    // Check for rate limit expiration
    useEffect(() => {
        if (rateLimitInfo.limited && rateLimitInfo.resetAt) {
            const checkRateLimit = () => {
                const now = Date.now();
                if (now >= rateLimitInfo.resetAt!) {
                    setRateLimitInfo({ limited: false });
                    if (debugMode) {
                        console.log('Rate limit expired, resuming normal operation');
                    }
                }
            };

            const interval = setInterval(checkRateLimit, 1000);
            return () => clearInterval(interval);
        }
    }, [rateLimitInfo, debugMode]);

    return {
        ...chatHelpers,
        handleSubmit,
        resetChat,
        rateLimitInfo,
        lastError,
        retryCount
    };
} 