import { CoreMessage, Message, StreamTextResult, Tool, ToolResult, ToolSet, streamText } from 'ai';
import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES } from '../logger/constants';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { extractUrls } from '@/lib/chat/url-utils';
import { openai } from '@ai-sdk/openai';

// Import the centralized cache service and message history service
import { chatEngineCache } from './cache-service';
import { MessageHistoryService, createMessageHistoryService } from './message-history';

/**
 * Chat Engine Configuration Interface
 * Defines all configurable aspects of the chat engine
 */
export interface ChatEngineConfig {
    // Basic configuration
    tools: Record<string, Tool<any, any>>; // Properly typed tools object
    requiresAuth?: boolean;
    corsEnabled?: boolean;

    // AI model configuration
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;

    // Feature flags
    useDeepSearch?: boolean;
    useWebScraper?: boolean;

    // Rate limiting
    rateLimitRequests?: number;
    rateLimitWindow?: number; // in seconds

    // Response formatting
    formatResponse?: (response: any) => any;

    // Logging
    operationName?: string;

    // Cache configuration
    cacheEnabled?: boolean;
    messageHistoryLimit?: number;
}

/**
 * Chat Engine Context Interface
 * Contains all context for a specific chat request
 */
export interface ChatEngineContext {
    // Request specific context
    requestId: string;
    sessionId: string;
    userId?: string;
    startTime: number;

    // Processing context
    messages: Message[];
    previousMessages?: Message[];

    // Extracted context
    urls?: string[];

    // Metrics and diagnostics
    metrics: {
        ragTimeMs?: number;
        webScraperTimeMs?: number;
        deepSearchTimeMs?: number;
        totalProcessingTimeMs?: number;
        tokenCount?: number;
        cacheHits?: number;
    };
}

/**
 * Chat Engine Class
 * Provides a unified interface for processing chat requests using AI
 */
export class ChatEngine {
    private config: ChatEngineConfig;
    private historyService: MessageHistoryService;

    /**
     * Initialize a new chat engine with the provided configuration
     * @param config - Configuration options for the chat engine
     */
    constructor(config: ChatEngineConfig) {
        this.config = {
            // Default configuration values
            corsEnabled: false,
            model: 'gpt-4o',
            maxTokens: 4096,
            temperature: 0.7,
            useDeepSearch: false,
            useWebScraper: true,
            rateLimitRequests: 50,
            rateLimitWindow: 3600,
            operationName: 'chat_engine',
            requiresAuth: true,
            cacheEnabled: true,
            messageHistoryLimit: 50,
            // Merge with provided config
            ...config
        };

        // Initialize the message history service
        this.historyService = createMessageHistoryService({
            operationName: this.config.operationName,
            cacheEnabled: this.config.cacheEnabled,
            messageHistoryLimit: this.config.messageHistoryLimit
        });

        // Log initialization
        edgeLogger.info('Chat engine initialized', {
            operation: this.config.operationName,
            model: this.config.model,
            requiresAuth: this.config.requiresAuth,
            useDeepSearch: this.config.useDeepSearch,
            useWebScraper: this.config.useWebScraper,
            cacheEnabled: this.config.cacheEnabled
        });
    }

    /**
     * Creates a new chat engine context for a request
     * @param messages - Array of messages for the conversation
     * @param sessionId - Session identifier for the conversation
     * @param userId - Optional user identifier for authenticated requests
     * @returns ChatEngineContext object
     */
    private async createContext(messages: Message[], sessionId: string, userId?: string): Promise<ChatEngineContext> {
        // Try to load previous messages from history service
        let previousMessages: Message[] | undefined;

        if (this.config.cacheEnabled) {
            previousMessages = await this.historyService.loadPreviousMessages(sessionId);
        }

        // Extract URLs from the latest user message for potential processing
        const userMessage = messages.find(m => m.role === 'user');
        const urls = userMessage?.content ? extractUrls(userMessage.content as string) : [];

        return {
            requestId: crypto.randomUUID(),
            sessionId,
            userId,
            startTime: Date.now(),
            messages,
            previousMessages,
            urls: urls.length > 0 ? urls : undefined,
            metrics: {
                cacheHits: previousMessages ? 1 : 0
            }
        };
    }

    /**
     * Handles authentication if required by the configuration
     * @param req - Request object
     * @returns Object with userId and optional error
     */
    private async handleAuth(req: Request): Promise<{ userId: string | undefined, error?: Response }> {
        if (!this.config.requiresAuth) {
            return { userId: undefined };
        }

        try {
            const cookieStore = cookies();
            const authClient = await createClient();

            // Get user ID from session
            const { data: { user } } = await authClient.auth.getUser();
            const userId = user?.id;

            if (!userId) {
                edgeLogger.warn('Unauthorized access attempt', {
                    operation: this.config.operationName,
                    path: new URL(req.url).pathname
                });

                return {
                    userId: undefined,
                    error: new Response('Unauthorized', { status: 401 })
                };
            }

            return { userId };
        } catch (error) {
            edgeLogger.error('Authentication error', {
                operation: this.config.operationName,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                userId: undefined,
                error: new Response('Authentication error', { status: 500 })
            };
        }
    }

    /**
     * Handles CORS headers for cross-origin requests
     * @param response - Response object to add CORS headers to
     * @param req - Request object with origin information
     * @returns Response with CORS headers added
     */
    private handleCors(response: Response, req: Request): Response {
        if (!this.config.corsEnabled) {
            return response;
        }

        const origin = req.headers.get('origin') || '';

        // Get allowed origins from environment or use default
        const allowedOrigins = process.env.WIDGET_ALLOWED_ORIGINS
            ? process.env.WIDGET_ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000'];

        const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');

        // Create a new Response with the original response's data and add CORS headers
        // This preserves the streamable nature of the AI SDK response
        const corsHeaders = new Headers(response.headers);

        if (isAllowedOrigin) {
            corsHeaders.set('Access-Control-Allow-Origin', origin);
        } else {
            corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
        }

        corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        corsHeaders.set('Access-Control-Max-Age', '86400');

        // Return a new response with the same body but with CORS headers
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: corsHeaders
        });
    }

    /**
     * Processes the request and generates a response using the AI model
     * Uses Vercel AI SDK to stream responses
     * @param context - Chat engine context with request information
     * @returns Response with streaming AI content
     */
    private async processRequest(context: ChatEngineContext): Promise<Response> {
        try {
            // Get recent history using the message history service
            const modelMessages = await this.historyService.getRecentHistory(
                context.sessionId,
                context.messages
            );

            // Simply use the system prompt without manual context injection
            // Context will be provided by tools when the LLM calls them
            const systemPrompt = this.config.systemPrompt || 'You are a helpful AI assistant.';
            const systemMessage: CoreMessage = {
                role: 'system',
                content: systemPrompt
            };

            // Add system message to the beginning
            const messagesWithSystem = [
                systemMessage,
                ...modelMessages
            ];

            // Store config values in local variables for callback access
            const operationName = this.config.operationName;
            const sessionId = context.sessionId;
            const userId = context.userId;

            // Call the AI model using Vercel AI SDK
            // Tools are now properly registered and will be called by the AI as needed
            const result = await streamText({
                model: openai(this.config.model as any),
                messages: messagesWithSystem,
                maxTokens: this.config.maxTokens,
                temperature: this.config.temperature,
                tools: this.config.tools, // Pass the tools object directly
                // Enable multi-step tool use for more complex interactions
                maxSteps: 5,
                // Add callbacks for monitoring and logging
                onChunk({ chunk }) {
                    // Monitor different types of chunks for logging
                    if (chunk.type === 'tool-call') {
                        edgeLogger.info('Tool call detected', {
                            operation: operationName,
                            toolName: chunk.toolName,
                            toolCallId: chunk.toolCallId,
                            sessionId
                        });
                    }
                },
                onFinish({ text, finishReason, usage }) {
                    // Log completion metrics
                    edgeLogger.info('Chat completion finished', {
                        operation: operationName,
                        finishReason,
                        completionTokens: usage?.completionTokens,
                        promptTokens: usage?.promptTokens,
                        totalTokens: usage?.totalTokens,
                        sessionId,
                        userId
                    });
                },
                onError({ error }) {
                    // Log any error that occurs during streaming
                    edgeLogger.error('Streaming error encountered', {
                        operation: operationName,
                        error: error instanceof Error ? error.message : String(error),
                        sessionId,
                        userId
                    });
                }
            });

            // Get the streamable response
            const response = result.toDataStreamResponse();

            // Save new messages to history (async, don't wait for completion)
            if (this.config.cacheEnabled) {
                this.historyService.addPlaceholderAndSave(
                    context.sessionId,
                    context.messages,
                    context.userId
                );
            }

            // Log request processing successful
            edgeLogger.info('Chat request processed successfully', {
                operation: this.config.operationName,
                durationMs: Date.now() - context.startTime,
                sessionId: context.sessionId,
                userId: context.userId
            });

            return response;
        } catch (error) {
            edgeLogger.error('Error processing chat request', {
                operation: this.config.operationName,
                error: error instanceof Error ? error.message : String(error),
                sessionId: context.sessionId,
                userId: context.userId
            });

            return new Response(
                JSON.stringify({
                    error: 'Failed to process request',
                    message: error instanceof Error ? error.message : 'Unknown error'
                }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
    }

    /**
     * Handle request timeout
     * @param timeoutMs - Timeout in milliseconds
     * @returns Object with promise and abort function
     */
    private createTimeoutHandler(timeoutMs: number = 55000): {
        promise: Promise<Response>,
        abort: () => void
    } {
        let timeoutId: NodeJS.Timeout;
        let resolver: (value: Response) => void;

        const promise = new Promise<Response>((resolve) => {
            resolver = resolve;
            timeoutId = setTimeout(() => {
                edgeLogger.error('Request timeout', {
                    operation: this.config.operationName,
                    timeoutMs
                });

                resolve(new Response(
                    JSON.stringify({
                        error: 'Request timeout',
                        message: 'The request took too long to process.'
                    }),
                    {
                        status: 408,
                        headers: { 'Content-Type': 'application/json' }
                    }
                ));
            }, timeoutMs);
        });

        return {
            promise,
            abort: () => {
                clearTimeout(timeoutId);
                resolver(new Response(
                    JSON.stringify({
                        error: 'Request aborted',
                        message: 'The request was aborted.'
                    }),
                    {
                        status: 499, // Client Closed Request
                        headers: { 'Content-Type': 'application/json' }
                    }
                ));
            }
        };
    }

    /**
     * Main entry point for handling a chat request
     * @param req - Request object
     * @returns Response with chat content
     */
    public async handleRequest(req: Request): Promise<Response> {
        let body;
        try {
            body = await req.json();
        } catch (error) {
            return this.handleCors(
                new Response(
                    JSON.stringify({ error: 'Invalid JSON body' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                ),
                req
            );
        }

        // Extract required parameters from request body
        const { message, messages, id, sessionId = crypto.randomUUID() } = body;

        // Validate the request - this will be moved to a dedicated validator
        if ((!message && !messages) || (!id && !sessionId)) {
            return this.handleCors(
                new Response(
                    JSON.stringify({ error: 'Missing required parameters' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                ),
                req
            );
        }

        // Handle authentication if required
        const { userId, error: authError } = await this.handleAuth(req);
        if (authError) {
            return this.handleCors(authError, req);
        }

        // Set up timeout handling
        const { promise: timeoutPromise, abort: abortTimeout } = this.createTimeoutHandler();

        try {
            // Prepare chat context
            let chatMessages: Message[];

            // Handle different message formats
            if (message && typeof message === 'string') {
                // Single message format
                chatMessages = [{
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: message
                }];
            } else if (messages && Array.isArray(messages)) {
                // Array of messages format
                chatMessages = messages;
            } else if (message && typeof message === 'object') {
                // Single message object format (from Vercel AI SDK)
                chatMessages = [message as Message];
            } else {
                return this.handleCors(
                    new Response(
                        JSON.stringify({ error: 'Invalid message format' }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } }
                    ),
                    req
                );
            }

            const context = await this.createContext(
                chatMessages,
                id || sessionId,
                userId
            );

            // Process the request
            const response = await this.processRequest(context);

            // Cancel the timeout since we've completed successfully
            abortTimeout();

            // Add CORS headers if needed
            return this.handleCors(response, req);
        } catch (error) {
            // Cancel the timeout and return error response
            abortTimeout();

            edgeLogger.error('Error handling chat request', {
                operation: this.config.operationName,
                error: error instanceof Error ? error.message : String(error)
            });

            return this.handleCors(
                new Response(
                    JSON.stringify({
                        error: 'Internal server error',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }),
                    {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    }
                ),
                req
            );
        }
    }
}

/**
 * Factory function to create a chat engine with the provided configuration
 * @param config - Configuration options for the chat engine
 * @returns Configured ChatEngine instance
 */
export function createChatEngine(config: ChatEngineConfig): ChatEngine {
    return new ChatEngine(config);
} 