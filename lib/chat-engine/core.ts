import { CoreMessage, Message, StreamTextResult, Tool, ToolResult, ToolSet, streamText } from 'ai';
import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES } from '../logger/constants';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { extractUrls } from '@/lib/utils/url-utils';
import { openai } from '@ai-sdk/openai';
import type { OpenAI } from 'openai';

// Import the centralized cache service and message history service
import { cacheService } from '@/lib/cache/cache-service';
import {
    MessagePersistenceService,
    MessageSaveResult,
    HistoryMessageInput,
    ToolsUsedData
} from './message-persistence';

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

        // Fix deepSearchEnabled flag - make sure it's propagated
        // IMPORTANT: This ensures the flag is passed to tool execution context
        if (this.config.useDeepSearch) {
            if (!this.config.body) {
                this.config.body = {};
            }
            this.config.body.deepSearchEnabled = true;

            // Add debug logging for configuration
            edgeLogger.info('DeepSearch flag configured', {
                operation: this.config.operationName || 'chat_engine',
                configUseDeepSearch: this.config.useDeepSearch,
                bodyDeepSearchEnabled: this.config.body.deepSearchEnabled,
                configKeys: Object.keys(this.config),
                bodyKeys: Object.keys(this.config.body)
            });
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
        // Create a request ID for this chat context
        const requestId = crypto.randomUUID();
        const startTime = Date.now();

        // Extract URLs from the latest user message
        const lastUserMessage = messages[messages.length - 1];
        const urls = lastUserMessage?.role === 'user' && typeof lastUserMessage.content === 'string'
            ? extractUrls(lastUserMessage.content)
            : [];

        // Load previous messages if available via persistence service
        let previousMessages: Message[] | undefined;
        if (userId && sessionId && this.persistenceService && !this.config.messagePersistenceDisabled) {
            try {
                previousMessages = await this.persistenceService.loadPreviousMessages(
                    sessionId,
                    userId,
                    this.config.messageHistoryLimit
                );

                if (previousMessages && previousMessages.length > 0) {
                    edgeLogger.info('Loaded previous messages from database', {
                        operation: this.config.operationName,
                        sessionId,
                        messageCount: previousMessages.length
                    });
                }
            } catch (error) {
                edgeLogger.error('Failed to load previous messages', {
                    operation: this.config.operationName,
                    sessionId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Return the context object
        return {
            requestId,
            sessionId,
            userId,
            startTime,
            messages,
            previousMessages,
            urls,
            metrics: {}
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
            // Generate a unique request ID for tracing this entire request lifecycle
            const requestId = crypto.randomUUID().substring(0, 8);

            // Get userId from context or body
            const userId = context.userId || (this.config.body?.userId as string);

            // Use a more privacy-focused user ID in logs
            const logUserId = userId ? (userId.substring(0, 3) + '...' + userId.substring(userId.length - 3)) : 'anonymous';

            if (userId) {
                edgeLogger.info('Using userId for persistence', {
                    operation: this.config.operationName,
                    sessionId: context.sessionId,
                    userId: logUserId,
                    requestId
                });
            }

            // Get recent history using the message persistence service
            const modelMessages = this.persistenceService && !this.config.messagePersistenceDisabled
                ? await this.persistenceService.getRecentHistory(
                    context.sessionId,
                    userId || '',
                    context.messages,
                    this.config.messageHistoryLimit
                )
                : context.messages;

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
            const messagePersistenceDisabled = this.config.messagePersistenceDisabled;
            const persistenceService = this.persistenceService;
            // Store reference to 'this' for use in callbacks
            const self = this;

            // For saving assistant message - find the last user message to ensure persistence in same order
            const lastUserMessage = context.messages.find(m => m.role === 'user');

            // Save the user message first if it exists
            if (lastUserMessage && userId && !messagePersistenceDisabled && persistenceService) {
                // Using Promise without await to avoid blocking
                // Fire-and-forget style, but still log errors
                this.saveUserMessage(
                    context,
                    typeof lastUserMessage.content === 'string'
                        ? lastUserMessage.content
                        : JSON.stringify(lastUserMessage.content)
                ).catch(error => {
                    edgeLogger.error('Failed to save user message (non-blocking)', {
                        operation: operationName,
                        error: error instanceof Error ? error.message : String(error),
                        sessionId,
                        messageId: lastUserMessage.id,
                        userId: logUserId,
                        requestId
                    });
                });
            }

            // Stream response with appropriate configuration
            const result = await streamText({
                model: openai(this.config.model || 'gpt-4o'),
                messages: [...context.previousMessages || [], ...context.messages],
                system: `${this.config.systemPrompt}\n\nIMPORTANT INSTRUCTION: When a user message contains a URL (in any format including https://example.com or just example.com), you MUST use the scrapeWebContent tool to retrieve and analyze the content before responding. Never attempt to guess the content of a URL without scraping it first. For example, if asked to summarize a blog post at a URL, first use scrapeWebContent to get the full content, then provide your summary based on the actual content.`,
                tools: this.config.tools,
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens,
                maxSteps: 5, // Allow multiple steps for complex tool interactions
                // Use auto tool selection always, and rely on tool descriptions to prioritize correctly
                toolChoice: 'auto',
                onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
                    // Log essential info about each step using AI SDK standard pattern
                    edgeLogger.info('Step completed in multi-step execution', {
                        operation: operationName,
                        hasText: !!text && text.length > 0,
                        textLength: text?.length || 0,
                        toolCallCount: toolCalls?.length || 0,
                        toolResultCount: toolResults?.length || 0,
                        finishReason,
                        usage: usage ? {
                            completionTokens: usage.completionTokens,
                            promptTokens: usage.promptTokens,
                            totalTokens: usage.totalTokens
                        } : undefined,
                        requestId
                    });

                    // Log tool calls when present
                    if (toolCalls && toolCalls.length > 0) {
                        edgeLogger.info('Tool calls executed', {
                            operation: operationName,
                            toolNames: toolCalls.map(call => call.toolName),
                            step: 'tool_calls',
                            requestId
                        });
                    }

                    // Log tool results when present
                    if (toolResults && toolResults.length > 0) {
                        edgeLogger.info('Tool results processed', {
                            operation: operationName,
                            toolResultCount: toolResults.length,
                            step: 'tool_results',
                            requestId
                        });
                    }
                },
                // Add onFinish callback to save the assistant message
                async onFinish({ text, response }) {
                    // Skip if message persistence is disabled
                    if (messagePersistenceDisabled || !persistenceService || !userId) {
                        edgeLogger.info('Skipping assistant message persistence', {
                            operation: operationName,
                            sessionId,
                            disabled: messagePersistenceDisabled,
                            hasPersistenceService: !!persistenceService,
                            hasUserId: !!userId,
                            requestId
                        });
                        return;
                    }

                    try {
                        // Extract any tool usage information from the response text
                        const textToolsUsed = text.includes('Tools and Resources Used')
                            ? self.extractToolsUsed(text)
                            : undefined;

                        // Extract tool calls data from the AI SDK response
                        let toolsUsed = textToolsUsed;

                        // Cast response to access OpenAI-specific properties
                        const openAIResponse = response as unknown as {
                            choices?: Array<{
                                message?: OpenAI.ChatCompletionMessage
                            }>
                        };

                        // Safely check for tool calls with proper optional chaining
                        const toolCalls = openAIResponse?.choices?.[0]?.message?.tool_calls;

                        if (toolCalls && toolCalls.length > 0) {
                            // Add or merge with existing tools data
                            toolsUsed = {
                                ...toolsUsed,
                                api_tool_calls: toolCalls.map((tool: OpenAI.ChatCompletionMessageToolCall) => ({
                                    name: tool.function?.name,
                                    id: tool.id,
                                    type: tool.type
                                }))
                            };

                            edgeLogger.info('Captured tool calls from AI SDK', {
                                operation: operationName,
                                sessionId,
                                toolCount: toolCalls.length,
                                toolNames: toolCalls.map((t: OpenAI.ChatCompletionMessageToolCall) => t.function?.name).filter(Boolean),
                                requestId
                            });
                        }

                        // Save the assistant message to the database
                        await self.saveAssistantMessage(context, text, toolsUsed);

                        edgeLogger.info('Successfully saved assistant message in onFinish', {
                            operation: operationName,
                            sessionId,
                            contentLength: text.length,
                            hasToolsUsed: !!toolsUsed,
                            requestId
                        });

                        // NEW TITLE GENERATION CODE
                        // Check if this is the first message in the conversation
                        // We can do this by checking the message history length
                        try {
                            const supabase = await createClient();
                            const { count, error: countError } = await supabase
                                .from('sd_chat_histories')
                                .select('id', { count: 'exact', head: true })
                                .eq('session_id', sessionId);

                            if (!countError && count !== null && count <= 2) { // 2 because we just saved the assistant message
                                // Find the first user message in the context
                                const firstUserMessage = context.messages.find(m => m.role === 'user');
                                if (firstUserMessage && firstUserMessage.content) {
                                    // Import title service and generate title asynchronously (fire and forget)
                                    try {
                                        const { generateAndSaveChatTitle } = await import('../chat/title-service');

                                        // Don't await this to avoid blocking the response
                                        generateAndSaveChatTitle(sessionId, firstUserMessage.content as string)
                                            .catch(titleError => {
                                                edgeLogger.error('Unhandled exception in title generation', {
                                                    category: LOG_CATEGORIES.CHAT,
                                                    operation: 'title_generation_error',
                                                    chatId: sessionId,
                                                    error: titleError instanceof Error ? titleError.message : String(titleError)
                                                });
                                            });
                                    } catch (importError) {
                                        edgeLogger.error('Failed to import title service', {
                                            category: LOG_CATEGORIES.CHAT,
                                            operation: 'title_import_error',
                                            error: importError instanceof Error ? importError.message : String(importError)
                                        });
                                    }
                                }
                            }
                        } catch (dbError) {
                            edgeLogger.error('Error checking message count for title generation', {
                                category: LOG_CATEGORIES.CHAT,
                                operation: 'title_check_error',
                                error: dbError instanceof Error ? dbError.message : String(dbError)
                            });
                        }
                        // END TITLE GENERATION CODE
                    } catch (error) {
                        edgeLogger.error('Failed to save assistant message in onFinish callback', {
                            operation: operationName,
                            error: error instanceof Error ? error.message : String(error),
                            sessionId,
                            userId: logUserId,
                            requestId
                        });
                    }
                }
            });

            // Consume the stream in the background to ensure all callbacks are triggered
            // even if the client disconnects from the HTTP response
            // This is important for message persistence
            result.consumeStream();

            edgeLogger.info('Stream consumption enabled to ensure processing completes', {
                operation: this.config.operationName,
                sessionId: context.sessionId,
                requestId
            });

            // Get the streamable response
            const response = result.toDataStreamResponse();

            // Log request processing successful
            edgeLogger.info('Chat request processed successfully', {
                operation: this.config.operationName,
                durationMs: Date.now() - context.startTime,
                sessionId: context.sessionId,
                userId: logUserId,
                requestId
            });

            return response;
        } catch (error) {
            edgeLogger.error('Error processing chat request', {
                operation: this.config.operationName,
                error: error instanceof Error ? error.message : String(error),
                sessionId: context.sessionId,
                userId: context.userId ? (context.userId.substring(0, 3) + '...' + context.userId.substring(context.userId.length - 3)) : 'anonymous',
                requestId: crypto.randomUUID().substring(0, 8) // Generate a new requestId for errors without context
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

            // Use userId from auth or from body.userId (for testing/bypass)
            const contextUserId = userId || (body.userId as string) || (this.config.body?.userId as string);

            if (contextUserId && !userId) {
                edgeLogger.info('Using userId from request body for context', {
                    operation: this.config.operationName,
                    userId: contextUserId,
                    source: userId ? 'auth' : body.userId ? 'body' : 'config'
                });
            }

            const context = await this.createContext(
                chatMessages,
                id || sessionId,
                contextUserId
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
     * Extracts tool usage information from the assistant message
     * @param text - The complete text from the assistant
     * @returns Object containing structured tool usage information or undefined
     */
    private extractToolsUsed(text: string): Record<string, any> | undefined {
        try {
            // Look for the tools and resources section
            const toolsSection = text.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);

            if (toolsSection && toolsSection[1]) {
                return {
                    tools: toolsSection[1]
                        .split('\n')
                        .filter(line => line.trim().startsWith('-'))
                        .map(line => line.trim())
                };
            }

            return undefined;
        } catch (error) {
            // Safely handle errors without interrupting the message flow
            edgeLogger.warn('Failed to extract tools used', {
                error: error instanceof Error ? error.message : String(error)
            });
            return undefined;
        }
    }

    private async saveUserMessage(
        context: ChatEngineContext,
        content: string
    ): Promise<void> {
        // Skip if message persistence is disabled
        if (this.config.messagePersistenceDisabled || !this.persistenceService) {
            return;
        }

        const { sessionId } = context;
        // Get userId from context or from config.body as fallback
        const userId = context.userId || (this.config.body?.userId as string);

        // Check for userId - required for RLS policies
        if (!userId) {
            edgeLogger.warn('No userId provided for message persistence', {
                operation: this.config.operationName,
                sessionId
            });
            return;
        }

        // Format content properly (string or JSON string)
        const formattedContent = typeof content === 'string'
            ? content
            : JSON.stringify(content);

        const messageId = crypto.randomUUID();

        edgeLogger.info('Saving user message', {
            operation: this.config.operationName,
            sessionId,
            userId,
            messageId,
            contentPreview: formattedContent.substring(0, 50) + (formattedContent.length > 50 ? '...' : '')
        });

        try {
            await this.persistenceService.saveMessage({
                sessionId,
                userId,
                role: 'user',
                content: formattedContent,
                messageId
            });
        } catch (error) {
            edgeLogger.error('Failed to save user message', {
                operation: this.config.operationName,
                sessionId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async saveAssistantMessage(
        context: ChatEngineContext,
        content: string,
        toolsUsed?: Record<string, any>
    ): Promise<void> {
        // Skip if message persistence is disabled
        if (this.config.messagePersistenceDisabled || !this.persistenceService) {
            return;
        }

        const { sessionId } = context;
        // Get userId from context or from config.body as fallback
        const userId = context.userId || (this.config.body?.userId as string);

        // Check for userId - required for RLS policies
        if (!userId) {
            edgeLogger.warn('No userId provided for message persistence', {
                operation: this.config.operationName,
                sessionId
            });
            return;
        }

        const messageId = crypto.randomUUID();

        // Enhanced logging with detailed tool usage information
        edgeLogger.info('Saving assistant message', {
            operation: this.config.operationName,
            sessionId,
            userId,
            messageId,
            contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
            hasToolsUsed: !!toolsUsed,
            toolsCount: toolsUsed?.api_tool_calls?.length || 0,
            toolNames: toolsUsed?.api_tool_calls?.map((t: { name?: string }) => t.name).filter(Boolean) || []
        });

        try {
            await this.persistenceService.saveMessage({
                sessionId,
                userId,
                role: 'assistant',
                content,
                messageId,
                tools: toolsUsed
            });
        } catch (error) {
            edgeLogger.error('Failed to save assistant message', {
                operation: this.config.operationName,
                sessionId,
                userId,
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