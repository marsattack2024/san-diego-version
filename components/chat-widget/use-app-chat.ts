import { useChat, Message, UseChatOptions } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import { getSession, saveSession, addMessageToSession, clearSession } from '@/lib/widget/session';

export interface UseAppChatOptions extends UseChatOptions {
    chatType?: 'standard' | 'widget';
    initialSessionId?: string;
    apiPath?: string;
}

/**
 * A wrapper around the Vercel AI SDK's useChat hook that adds session management
 * and rate limiting capabilities specifically for our application.
 */
export function useAppChat({
    chatType = 'widget',
    initialSessionId,
    apiPath,
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
            }

            // Call the original onFinish handler if provided
            if (options.onFinish) {
                options.onFinish(message, details);
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
            }
        }
    }, [sessionId, chatHelpers.setMessages, chatHelpers.messages.length]);

    // Custom submit handler to check rate limiting before submission
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, options?: any) => {
        e.preventDefault();

        // Check for rate limiting
        if (rateLimitInfo.limited) {
            return;
        }

        // Save the current input to a variable as it will be cleared during submission
        const currentInput = chatHelpers.input;
        const isFirstMessage = chatHelpers.messages.length === 0;

        try {
            // Use the original submit handler
            await chatHelpers.handleSubmit(e, options);

            // Update the session with the new message
            if (sessionId && currentInput.trim()) {
                const session = getSession();

                // Find the message we just added (should be the last user message)
                const userMessage = [...chatHelpers.messages].reverse()
                    .find(msg => msg.role === 'user' && msg.content === currentInput);

                if (userMessage) {
                    const updatedSession = addMessageToSession(session, userMessage);
                    saveSession(updatedSession);
                }
            }
        } catch (error) {
            // If this is the first message and there's an error, it might be a cold start issue
            if (isFirstMessage) {
                console.warn("Error sending first message, attempting to warm up the API...");

                try {
                    // Try to ping the API to warm it up
                    await fetch('/api/ping?source=error_recovery', {
                        method: 'GET',
                        headers: { 'Cache-Control': 'no-cache' }
                    });

                    // Wait a moment for the API to initialize
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Try submitting again with the same input
                    if (currentInput.trim()) {
                        chatHelpers.setInput(currentInput);
                        // We need to create a synthetic event since we don't have the original
                        const syntheticEvent = {
                            preventDefault: () => { }
                        } as React.FormEvent<HTMLFormElement>;

                        await chatHelpers.handleSubmit(syntheticEvent, options);
                    }
                } catch (retryError) {
                    console.error("Failed to recover from cold start", retryError);
                }
            }
        }
    };

    // Function to clear the chat history
    const resetChat = () => {
        chatHelpers.setMessages([]);
        if (sessionId) {
            clearSession();
            const newSession = getSession(); // This creates a new session
            setSessionId(newSession.id);
        }
    };

    // Check if rate limit has expired
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

    return {
        ...chatHelpers,
        handleSubmit,
        resetChat,
        sessionId,
        rateLimitInfo
    };
} 