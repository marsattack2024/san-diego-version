'use client';

import React, { useState, useEffect, useRef } from 'react';
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

    // References for UI interactions
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current && isOpen) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, isOpen]);

    // Focus input when opening the widget
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    // Handle text area input including Enter key submission
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && status === 'ready') {
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
                    className="rounded-full p-4 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
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
                    <ScrollArea className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
                        {/* Welcome message */}
                        {messages.length === 0 && (
                            <div className="text-center my-8 text-gray-500">
                                <p>{widgetConfig.greeting || "Hello! How can I help you today?"}</p>
                            </div>
                        )}

                        {/* Message list */}
                        <div className="space-y-4">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex flex-col max-w-[80%] rounded-lg p-3",
                                        message.role === 'user'
                                            ? "ml-auto bg-primary/10 text-foreground"
                                            : "mr-auto bg-muted text-muted-foreground"
                                    )}
                                >
                                    <div className="whitespace-pre-wrap">
                                        {/* If using parts API */}
                                        {message.parts?.map((part, i) => (
                                            part.type === 'text' ? <span key={i}>{part.text}</span> : null
                                        )) || message.content}
                                    </div>
                                </div>
                            ))}

                            {/* Loading indicator during message sending */}
                            {status === 'streaming' && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader className="h-3 w-3 animate-spin" />
                                    <span>Processing...</span>
                                </div>
                            )}

                            {/* Error message */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 text-sm text-red-500 bg-red-50 rounded-lg">
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

                            <div ref={messagesEndRef} />
                        </div>
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
                                className="h-[60px] shrink-0"
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