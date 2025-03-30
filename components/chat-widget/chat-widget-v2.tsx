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

interface ChatWidgetProps {
    config?: Partial<ChatWidgetConfig>
}

export function ChatWidgetV2({ config = {} }: ChatWidgetProps) {
    // Merge default config with provided config
    const widgetConfig = { ...DEFAULT_CONFIG, ...config };

    // Widget UI state
    const [isOpen, setIsOpen] = useState(false);

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
                <button
                    onClick={() => setIsOpen(true)}
                    className="rounded-full p-4 shadow-lg text-primary-foreground transition-all"
                    style={{ backgroundColor: widgetConfig.primaryColor || '#0070f3' }}
                    aria-label="Open chat"
                >
                    <MessageSquare className="h-6 w-6" />
                </button>
            )}

            {/* Chat widget container */}
            {isOpen && (
                <div
                    className="bg-white rounded-lg shadow-xl flex flex-col overflow-hidden"
                    style={{
                        width: `${widgetConfig.width || 360}px`,
                        height: `${widgetConfig.height || 500}px`,
                        maxWidth: '90vw',
                        maxHeight: '90vh'
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between p-4 border-b"
                        style={{
                            backgroundColor: widgetConfig.primaryColor || '#0070f3',
                            color: '#fff'
                        }}
                    >
                        <h3 className="font-medium text-lg">{widgetConfig.title || 'Chat'}</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={resetChat}
                                className="p-1 rounded-full hover:bg-white/20 transition-colors"
                                title="Clear chat"
                            >
                                <RefreshCw className="h-5 w-5" />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-full hover:bg-white/20 transition-colors"
                                title="Close chat"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Messages area */}
                    <div className="flex-1 overflow-hidden p-0">
                        {/* Welcome message */}
                        {messages.length === 0 && (
                            <div className="text-center my-8 p-4 text-gray-500">
                                <p>{widgetConfig.greeting || "Hello! How can I help you today?"}</p>
                            </div>
                        )}

                        {/* Message list using Virtuoso */}
                        {messages.length > 0 && (
                            <Virtuoso
                                ref={virtuosoRef}
                                style={{ height: '100%', width: '100%' }}
                                data={messages}
                                className="p-4"
                                // Only follow output if shouldAutoScroll is true
                                followOutput={shouldAutoScroll ? 'auto' : false}
                                // Use smooth scrolling for better UX
                                followOutputSmooth={true}
                                // This is the key handler that updates our scroll state
                                atBottomStateChange={(isAtBottom) => {
                                    handleScrollPositionChange(isAtBottom);
                                }}
                                // Add custom threshold to consider "near bottom" 
                                atBottomThreshold={150}
                                // Make auto-scrolling smoother during streaming
                                overscan={shouldAutoScroll && isStreaming ? 200 : 0}
                                itemContent={(index, message) => {
                                    // Check if the message actually has displayable content
                                    const hasTextContent = !!message.content || (message.parts && message.parts.some(p => p.type === 'text' && p.text));

                                    // Skip rendering empty assistant messages (prevent gray line)
                                    if (message.role === 'assistant' && !hasTextContent) {
                                        return null;
                                    }

                                    return (
                                        <div
                                            className={cn(
                                                "flex flex-col max-w-[80%] rounded-lg p-3 overflow-hidden mb-3",
                                                message.role === 'user'
                                                    ? "ml-auto bg-primary/10 text-foreground"
                                                    : "mr-auto bg-muted text-foreground"
                                            )}
                                        >
                                            <div className="whitespace-pre-wrap break-words w-full">
                                                {/* If using parts API */}
                                                {message.parts?.map((part, i) => (
                                                    part.type === 'text' ? <span key={i}>{part.text}</span> : null
                                                )) || message.content}
                                            </div>
                                        </div>
                                    );
                                }}
                                components={{
                                    Footer: () => status === 'streaming' ? (
                                        <div className="mt-4 flex items-center gap-2 mb-4" style={{ marginLeft: '8px' }}>
                                            <Loader className="h-3 w-3 animate-spin text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">Processing...</span>
                                        </div>
                                    ) : null
                                }}
                            />
                        )}

                        {/* Processing indicator now handled by Virtuoso Footer */}

                        {/* Error message moved outside space-y-4 as well */}
                        {error && (
                            <div className="mt-4 flex items-center gap-2 p-3 text-sm text-red-500 bg-red-50 rounded-lg">
                                <AlertCircle className="h-4 w-4" />
                                <span>{getErrorMessage()}</span>
                                {status !== 'streaming' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => reload()}
                                        className="ml-auto text-xs"
                                    >
                                        Retry
                                    </Button>
                                )}
                            </div>
                        )}
                    </ScrollArea>

                    {/* Input area */}
                    <div className="p-4 border-t">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <Textarea
                                ref={inputRef}
                                placeholder={widgetConfig.placeholder || "Type your message..."}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                disabled={status === 'streaming' || rateLimitInfo.limited}
                                className="flex-1 min-h-[60px] max-h-[120px] resize-none"
                                rows={1}
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!input.trim() || status === 'streaming' || rateLimitInfo.limited}
                                className="h-[60px] shrink-0 text-primary-foreground"
                                style={{ backgroundColor: widgetConfig.primaryColor || '#0070f3' }}
                                title="Send message"
                            >
                                {status === 'streaming' ? (
                                    <Loader className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </form>

                        {/* Rate limit warning */}
                        {rateLimitInfo.limited && (
                            <div className="mt-2 text-xs text-amber-500">
                                Rate limit reached. Please wait a moment before sending more messages.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
} 