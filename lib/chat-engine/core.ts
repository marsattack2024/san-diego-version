import { CoreMessage, Message, StreamTextResult, Tool, ToolResult, ToolSet, streamText } from 'ai';
import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES } from '../logger/constants';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { extractUrls } from '@/lib/utils/url-utils';
import { openai } from '@ai-sdk/openai';

// Import the centralized cache service and message history service
import { chatEngineCache } from './cache-service';
import { MessagePersistenceService } from './message-persistence';

/**
 * Chat Engine Configuration Interface
 * Defines all configurable aspects of the chat engine
 */
export interface ChatEngineConfig {
    // Basic configuration
    tools?: Record<string, Tool<any, any>>; // Properly typed tools object
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

    /**
     * Prompts to use with the chat engine.
     */
    prompts?: any;

    /**
     * The agent type being used.
     */
    agentType?: string;

    /**
     * Optional request body parameters that will be passed to tool execution
     * Used for passing feature flags and other configuration options to tools
     */
    body?: Record<string, any>;

    /**
     * Whether to disable persisting messages to the database
     */
    messagePersistenceDisabled?: boolean;
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
    private persistenceService: MessagePersistenceService;

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
            messagePersistenceDisabled: false,
            // Merge with provided config
            ...config
        };

        // Explicit override from the body parameter if available
        if (this.config.body?.deepSearchEnabled === true) {
            this.config.useDeepSearch = true;
        }

        // Initialize the message persistence service
        this.persistenceService = new MessagePersistenceService({
            operationName: this.config.operationName,
            throwErrors: false,
            messageHistoryLimit: this.config.messageHistoryLimit,
            disabled: this.config.messagePersistenceDisabled
        });

        // Log initialization
        edgeLogger.info('Chat engine initialized', {
            operation: this.config.operationName,
            model: this.config.model,
            requiresAuth: this.config.requiresAuth,
            useDeepSearch: this.config.useDeepSearch,
            useWebScraper: this.config.useWebScraper,
            cacheEnabled: this.config.cacheEnabled,
            messagePersistenceDisabled: this.config.messagePersistenceDisabled
        });
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
            // First try to get the Authorization header
            const authHeader = req.headers.get('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                // Process token-based auth here
                // This is a placeholder for JWT verification
                // For now, we'll just log it
                edgeLogger.info('Using token-based authentication', {
                    operation: this.config.operationName
                });

                // Return a dummy user ID for development
                // In production, you would verify the token
                return { userId: 'token-auth-user' };
            }

            // Try cookie-based auth as fallback
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
            } catch (cookieError) {
                // Log the cookie access error but don't fail immediately
                edgeLogger.warn('Cookie access error in auth handler', {
                    operation: this.config.operationName,
                    error: cookieError instanceof Error ? cookieError.message : String(cookieError)
                });

                // For development/testing only: bypass auth if cookies aren't available
                // This is temporary until we implement proper Edge-compatible auth
                if (process.env.NODE_ENV !== 'production') {
                    edgeLogger.warn('Bypassing auth in development environment', {
                        operation: this.config.operationName
                    });
                    return { userId: 'bypassed-auth-user' };
                }

                // In production, still return an auth error
                return {
                    userId: undefined,
                    error: new Response('Authentication error', { status: 401 })
                };
            }
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
            previousMessages = await this.persistenceService.getRecentHistory(
                sessionId,
                messages,
                this.config.messageHistoryLimit
            );
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
     * Creates a timeout handler with promise and abort function
     * @returns Object with promise and abort function
     */
    private createTimeoutHandler() {
        let timeoutId: ReturnType<typeof setTimeout>;
        let abortFunc: () => void;

        const promise = new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 30000); // 30 second timeout

            abortFunc = () => {
                clearTimeout(timeoutId);
            };
        });

        return { promise, abort: abortFunc! };
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
            const modelMessages = await this.persistenceService.getRecentHistory(
                context.sessionId,
                context.messages,
                this.config.messageHistoryLimit
            );

            // Add Deep Search information to user messages so it's accessible in the context
            const systemPrompt = this.config.systemPrompt || 'You are a helpful AI assistant.';

            // Create system message with feature flags explicitly included
            const dsEnabled = this.config.body?.deepSearchEnabled ? 'deepSearchEnabled' : 'deepSearchDisabled';
            let systemContent = `${systemPrompt}\n\nFeature flags: ${dsEnabled}`;

            const systemMessage: CoreMessage = {
                role: 'system',
                content: systemContent
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
            const messagePersistenceDisabled = this.config.messagePersistenceDisabled;
            const persistenceService = this.persistenceService;

            // For saving assistant message - find the last user message to ensure persistence in same order
            const lastUserMessage = context.messages.find(m => m.role === 'user');

            // Save the user message first if it exists
            if (lastUserMessage && userId && !messagePersistenceDisabled) {
                // Using Promise without await to avoid blocking
                // Fire-and-forget style, but still log errors
                this.saveUserMessage(
                    sessionId,
                    userId,
                    lastUserMessage
                ).catch(error => {
                    edgeLogger.error('Failed to save user message (non-blocking)', {
                        operation: this.config.operationName,
                        error: error instanceof Error ? error.message : String(error),
                        sessionId,
                        messageId: lastUserMessage.id
                    });
                });
            }

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
                onChunk({ chunk }: { chunk: any }) {
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
                onFinish: async ({ text, finishReason, usage }: { text: string, finishReason: string, usage?: { completionTokens?: number, promptTokens?: number, totalTokens?: number } }) => {
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

                    // Save assistant message if user is authenticated and persistence is enabled
                    if (userId && !messagePersistenceDisabled) {
                        // Extract tool usage from the assistant's response
                        const toolsUsed = this.extractToolsUsed(text);

                        // Create a unique ID for the assistant message
                        const assistantMessageId = crypto.randomUUID();

                        // Save the assistant message
                        await this.saveAssistantMessage(
                            sessionId,
                            userId,
                            text,
                            assistantMessageId,
                            toolsUsed
                        );
                    }
                },
                onError({ error }: { error: any }) {
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
     * Handles incoming chat request
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

    /**
     * Extract tools used from assistant message content
     * This is a utility function to extract tool usage information from the message
     */
    private extractToolsUsed(content: string): Record<string, any> | undefined {
        try {
            // Check for tools section in the message
            const toolsSection = content.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);

            if (toolsSection && toolsSection[1]) {
                const toolsList = toolsSection[1]
                    .split('\n')
                    .filter(line => line.trim().startsWith('-'))
                    .map(line => line.trim().substring(1).trim());

                if (toolsList.length > 0) {
                    const tools: Record<string, any> = {};

                    // Add each tool to the record
                    toolsList.forEach(tool => {
                        const toolName = tool.includes(':')
                            ? tool.split(':')[0].trim()
                            : tool;

                        tools[toolName] = { used: true };
                    });

                    return tools;
                }
            }

            return undefined;
        } catch (error) {
            edgeLogger.warn('Error extracting tools used', {
                error: error instanceof Error ? error.message : String(error)
            });

            return undefined;
        }
    }

    // Using the correct method signature for the persistenceService.saveMessage method
    private async saveUserMessage(sessionId: string, userId: string | undefined, message: Message): Promise<void> {
        try {
            if (!userId || this.config.messagePersistenceDisabled) {
                return;
            }

            await this.persistenceService.saveMessage({
                sessionId,
                role: message.role as any,
                content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                messageId: message.id,
                userId
            }).catch(error => {
                edgeLogger.error('Failed to save user message', {
                    operation: this.config.operationName,
                    sessionId,
                    messageId: message.id,
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        } catch (error) {
            edgeLogger.error('Error in saveUserMessage', {
                operation: this.config.operationName,
                sessionId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async saveAssistantMessage(
        sessionId: string,
        userId: string | undefined,
        content: string,
        messageId: string,
        toolsUsed?: Record<string, any>
    ): Promise<void> {
        try {
            if (!userId || this.config.messagePersistenceDisabled) {
                return;
            }

            await this.persistenceService.saveMessage({
                sessionId,
                role: 'assistant',
                content,
                messageId,
                userId,
                tools: toolsUsed
            }).catch(error => {
                edgeLogger.error('Failed to save assistant message', {
                    operation: this.config.operationName,
                    sessionId,
                    messageId,
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        } catch (error) {
            edgeLogger.error('Error in saveAssistantMessage', {
                operation: this.config.operationName,
                sessionId,
                error: error instanceof Error ? error.message : String(error)
            });
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