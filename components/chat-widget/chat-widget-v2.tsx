'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useScrollStore } from '@/stores/scroll-store';
import { X, Send, MessageSquare, AlertCircle, RefreshCw, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppChat } from './use-app-chat';
import {
    ChatWidgetConfig,
    POSITION_STYLES,
    DEFAULT_CONFIG
} from './types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
// No avatar component needed
import { Message, useChat } from '@ai-sdk/react';
// ChatWidgetProps is defined locally

interface ChatWidgetProps {
    config?: Partial<ChatWidgetConfig>
}

export function ChatWidgetV2({ config = {} }: ChatWidgetProps) {
    // Merge default config with provided config
    const widgetConfig = { ...DEFAULT_CONFIG, ...config };
    // Ensure subtitle is available even if TS doesn't recognize it
    const subtitle = widgetConfig.subtitle || 'Mastermind AI Assistant';

    // Widget UI state
    const [isOpen, setIsOpen] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Chat functionality using Vercel AI SDK through our custom hook
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        status,
        error,
        stop,
        reload,
        setInput,
        rateLimitInfo,
        resetChat
    } = useAppChat({
        chatType: 'widget',
        api: '/api/widget-chat',
        debugMode: process.env.NODE_ENV === 'development',
        onError: (err) => {
            setHasError(true);
        }
    });

    // Track when user sends a message (for scroll behavior)
    const [hasUserSentMessage, setHasUserSentMessage] = useState(false);

    // References for UI interactions
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    // Get scroll state and actions from the store
    const {
        shouldAutoScroll,
        isStreaming,
        handleScrollPositionChange,
        resetOnUserMessage,
        setIsStreaming
    } = useScrollStore();

    // Focus input when opening the widget
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    // Update streaming state based on chat status
    useEffect(() => {
        setIsStreaming(status === 'streaming');
    }, [status, setIsStreaming]);

    // Reset scroll behavior when user sends a message
    useEffect(() => {
        if (hasUserSentMessage) {
            resetOnUserMessage();
            // Programmatically scroll to bottom when user sends a message
            if (virtuosoRef.current && messages.length > 0) {
                virtuosoRef.current.scrollToIndex({
                    index: messages.length - 1,
                    behavior: 'smooth',
                    align: 'end'
                });
            }

            // Reset the flag after a short delay
            setTimeout(() => {
                setHasUserSentMessage(false);
            }, 100);
        }
    }, [hasUserSentMessage, messages.length, resetOnUserMessage]);

    // Reset error state when user tries to send a new message
    useEffect(() => {
        if (input.trim().length > 0) {
            setHasError(false);
        }
    }, [input]);

    // Handle text area input including Enter key submission
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && status === 'ready') {
                // Mark that user is sending a message (for scroll behavior)
                setHasUserSentMessage(true);

                const form = e.currentTarget.form;
                if (form) handleSubmit(new SubmitEvent('submit', { bubbles: true }) as any);
            }
        }
    };

    // Format error messages for UI display
    const getErrorMessage = () => {
        if (!error) return null;

        if (rateLimitInfo.limited) {
            const resetTime = new Date(rateLimitInfo.resetAt || 0).toLocaleTimeString();
            return `Rate limit exceeded. Please try again after ${resetTime}.`;
        }

        // Standard error messages based on status code
        return error.message || "Something went wrong. Please try again later.";
    };

    // Ping the widget API on initial load to warm up the serverless function
    useEffect(() => {
        const warmupAPI = async () => {
            try {
                const pingUrl = '/api/ping?source=widget_init';
                await fetch(pingUrl, {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache, no-store',
                        'Pragma': 'no-cache'
                    }
                });
                console.log('Widget API warmed up');
            } catch (error) {
                // Silent fail - if ping fails, the first message will just be slower
            }
        };

        warmupAPI();
    }, []);

    // Function to retry the last failed message
    const handleRetry = () => {
        if (messages.length > 0) {
            setHasError(false);

            // Find the last user message
            const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');

            if (lastUserMessage) {
                setInput(typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '');
                setTimeout(() => {
                    const form = document.querySelector('form');
                    if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
                }, 100);
            }
        }
    };

    // Scroll handling is now managed by Virtuoso

    return (
        <div
            className="fixed z-50 font-sans"
            style={{
                ...POSITION_STYLES[widgetConfig.position || 'bottom-right'],
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
        >
            {/* Chat bubble button */}
            {!isOpen && (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="rounded-full w-14 h-14 shadow-lg"
                    style={{
                        backgroundColor: widgetConfig.primaryColor || '#0070f3',
                    }}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                </Button>
            )}

            {/* Chat widget container */}
            {isOpen && (
                <Card className="w-[350px] shadow-xl overflow-hidden flex flex-col">
                    <CardHeader
                        className="pb-0 pt-4"
                        style={{
                            backgroundColor: widgetConfig.primaryColor || '#0070f3',
                            color: 'white',
                        }}
                    >
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg">
                                {widgetConfig.title || 'Chat with us'}
                            </CardTitle>
                            <Button
                                variant="ghost"
                                onClick={() => setIsOpen(false)}
                                className="h-8 w-8 p-0 text-white hover:text-white/80 hover:bg-transparent"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </Button>
                        </div>
                        <CardDescription className="text-white/85 pb-3">
                            {subtitle}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="px-0 flex-grow h-[300px] overflow-hidden">
                        <Virtuoso
                            className="h-full"
                            initialTopMostItemIndex={messages.length - 1}
                            data={messages}
                            followOutput={"smooth"}
                            itemContent={(index, message) => (
                                <div
                                    key={message.id}
                                    className={`flex items-start p-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'
                                        }`}
                                >
                                    <div
                                        className={`rounded-lg px-3 py-2 max-w-[80%] ${message.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 text-gray-800'
                                            }`}
                                    >
                                        {typeof message.content === 'string'
                                            ? message.content
                                            : message.parts && Array.isArray(message.parts) && message.parts.length > 0
                                                ? message.parts.map((part, idx) =>
                                                    part.type === 'text' && 'text' in part
                                                        ? <div key={idx}>{part.text}</div>
                                                        : null
                                                )
                                                : JSON.stringify(message.content)
                                        }
                                    </div>
                                </div>
                            )}
                            components={{
                                Footer: () => (
                                    <>
                                        {/* Error display */}
                                        {hasError && (
                                            <div className="px-4 py-3 flex flex-col items-center">
                                                <div className="flex items-center text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">
                                                    <AlertCircle className="h-4 w-4 mr-2" />
                                                    <span className="text-sm">
                                                        Connection error. Please check your internet and try again.
                                                    </span>
                                                </div>
                                                <Button
                                                    onClick={handleRetry}
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center"
                                                >
                                                    <RefreshCw className="h-3 w-3 mr-2" />
                                                    Retry
                                                </Button>
                                            </div>
                                        )}

                                        {/* Streaming indicator */}
                                        {status === 'streaming' && (
                                            <div className="p-3 flex items-center justify-center">
                                                <div className="flex items-center bg-blue-50 rounded-lg px-3 py-1">
                                                    <Loader className="h-3 w-3 mr-2 animate-spin" />
                                                    <span className="text-xs text-blue-600">Thinking...</span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )
                            }}
                        />
                    </CardContent>

                    <CardFooter className="border-t px-3 py-3">
                        <form
                            onSubmit={handleSubmit}
                            className="flex w-full items-center space-x-2"
                        >
                            <Textarea
                                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                                placeholder={widgetConfig.placeholder || "Type your message..."}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                disabled={status === 'streaming' || rateLimitInfo.limited}
                                className="flex-1 min-h-[40px] resize-none"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!input.trim() || status === 'streaming' || rateLimitInfo.limited}
                                style={{
                                    backgroundColor: widgetConfig.primaryColor || '#0070f3',
                                }}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                            </Button>
                        </form>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
} 