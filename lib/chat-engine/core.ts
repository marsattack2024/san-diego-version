import { createClient } from '@/utils/supabase/server';
import { ChatEngineConfig } from './chat-engine.config';
import { ChatEngineContext } from './types';
import { CoreMessage, Message, StreamTextResult, Tool, ToolResult, ToolSet, streamText, ToolCall } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { NextRequest, NextResponse } from 'next/server';
import { AgentType, buildSystemPrompt, buildSystemPromptWithDeepSearch } from './prompts';
import { createToolSet } from '@/lib/tools/registry.tool';
import { extractUrls } from '@/lib/utils/url-utils';
import { MessagePersistenceService } from './message-persistence';
import { chatLogger } from '@/lib/logger/chat-logger';
import { openai } from '@ai-sdk/openai';
import { RequestCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { cookies } from 'next/headers';
import { withContext } from '../logger/context';

// Helper functions for user ID masking and operation ID generation
const maskUserId = (userId: string): string => {
    return userId ? userId.substring(0, 5) + '...' + userId.substring(userId.length - 4) : 'anonymous';
};

const generateOperationId = (prefix: string): string => {
    return `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
};

/**
 * Chat Engine Configuration Interface
 * Defines all configurable aspects of the chat engine
 */
// REMOVED - Moved to lib/chat-engine/chat-engine.config.ts
/*
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

    prompts?: any;
    agentType?: string;
    body?: Record<string, any>;
    messagePersistenceDisabled?: boolean;
}
*/

/**
 * Chat Engine Context Interface
 * Contains all context for a specific chat request
 */
// REMOVED - Moved to lib/chat-engine/types.ts
/*
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

    // Session metadata
    sessionMetadata?: {
        title?: string;
    };
}
*/

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
            temperature: 0.5,
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

        // REMINDER: Authentication logic moved to ApiAuthService. 
        // This block will be replaced in Phase 8 using the injected service.
        /*
        const { userId, error: authError } = await this.handleAuth(req);
        if (authError) {
            // Apply CORS to the auth error Response before returning
            return handleCors(authError, req, this.config.corsEnabled || false);
        }
        */
        // TEMPORARY: Define userId as potentially undefined until Phase 8
        const userId: string | undefined = undefined;

        // Set up timeout handling
        const { promise: timeoutPromise, abort: abortTimeout } = this.createTimeoutHandler();

        // Extract message ID for tracking
        let messageId: string;
        if (typeof message === 'string') {
            messageId = crypto.randomUUID();
        } else if (message && typeof message === 'object' && 'id' in message) {
            messageId = message.id as string;
        } else if (messages && messages.length > 0 && 'id' in messages[messages.length - 1]) {
            messageId = messages[messages.length - 1].id as string;
        } else {
            messageId = crypto.randomUUID();
        }

        // Use userId from auth or from body.userId (for testing/bypass)
        // TEMPORARY: Use body/config userId until auth is re-integrated in Phase 8
        const contextUserId = /* userId || */ (body.userId as string) || (this.config.body?.userId as string);

        // Start end-to-end request tracking with chat logger
        const logContext = chatLogger.requestReceived({
            sessionId: id || sessionId,
            userId: contextUserId,
            messageId,
            agentType: body.agentId,
            deepSearchEnabled: body.deepSearchEnabled
        });

        // Use withContext to maintain timing context throughout the request lifecycle
        return withContext(logContext, async () => {
            try {
                // Prepare chat context
                let chatMessages: Message[];

                // Handle different message formats
                if (message && typeof message === 'string') {
                    // Single message format
                    chatMessages = [{
                        id: messageId,
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
                    chatLogger.error('Invalid message format', 'Format validation failed', {
                        messageType: typeof message
                    });
                    return this.handleCors(
                        new Response(
                            JSON.stringify({ error: 'Invalid message format' }),
                            { status: 400, headers: { 'Content-Type': 'application/json' } }
                        ),
                        req
                    );
                }

                if (contextUserId && !userId) {
                    edgeLogger.info('Using userId from request body for context', {
                        operation: this.config.operationName,
                        userId: contextUserId,
                        source: userId ? 'auth' : body.userId ? 'body' : 'config'
                    });
                }

                // REMINDER: This call will be updated in Phase 8 to use the injected AIStreamService
                // const response = await this.processRequest(context);
                // TEMPORARY placeholder for response:
                const response = new Response("Placeholder response - processRequest moved", { status: 501 });

                abortTimeout();

                // Add CORS headers if needed
                return this.handleCors(response, req);
            } catch (error) {
                // Cancel the timeout and return error response
                abortTimeout();

                // Log the error with chat logger for end-to-end timing
                chatLogger.error('Error handling chat request',
                    error instanceof Error ? error.message : String(error),
                    {
                        operation: this.config.operationName,
                        path: new URL(req.url).pathname,
                        agentType: body.agentId
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
        });
    }

    /**
     * Extracts tool usage information from the assistant message
     * @param text - The complete text from the assistant
     * @returns Object containing structured tool usage information or undefined
     */
    private extractToolsUsed(text: string): Record<string, any> | undefined {
        try {
            // Look for the markdown-formatted resources section
            // Match both plain text and markdown formatted resources sections
            const toolsSection = text.match(/---\s*(?:\*\*Resources used:?\*\*|Resources used:?)\s*([\s\S]*?)(?:---|\n\n|$)/i);

            if (toolsSection && toolsSection[1]) {
                return {
                    tools: toolsSection[1]
                        .split('\n')
                        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
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
            // Fallback to the original method
            // Use the toolCall information directly from the AI SDK response
            if (content && (content as any)?.choices?.[0]?.message?.tool_calls) {
                const aiToolCalls = (content as any)?.choices?.[0]?.message?.tool_calls;

                if (aiToolCalls && aiToolCalls.length > 0) {
                    // Add or merge with existing tools data
                    toolsUsed = {
                        ...toolsUsed,
                        api_tool_calls: aiToolCalls.map((tool: any) => ({
                            name: tool.function?.name,
                            id: tool.id,
                            type: tool.type
                        }))
                    };

                    edgeLogger.info('Captured tool calls from AI SDK response', {
                        operation: this.config.operationName,
                        sessionId: context.sessionId,
                        toolCount: aiToolCalls.length,
                        toolNames: aiToolCalls.map((t: any) => t.function?.name).filter(Boolean),
                        requestId: crypto.randomUUID().substring(0, 8)
                    });
                }
            }

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