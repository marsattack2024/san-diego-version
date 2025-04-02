/**
 * Chat Engine Facade
 * 
 * This facade orchestrates the entire chat flow by delegating to specialized services.
 * It follows the Single Responsibility Principle by focusing only on the high-level flow,
 * leaving implementation details to the injected services.
 */

import { Message, ToolCall } from 'ai';
import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { chatLogger } from '@/lib/logger/chat-logger';
import { ApiAuthService } from '@/lib/auth/api-auth.service';
import { ChatContextService } from './services/chat-context.service';
import { AIStreamService } from './services/ai-stream.service';
import { MessagePersistenceService } from './message-persistence';
import { triggerTitleGenerationViaApi } from '@/lib/chat/title-service';
import { ChatEngineConfig } from './chat-engine.config';
import { ChatEngineContext } from './types';
import { withContext } from '@/lib/logger/context';
import { handleCors } from '@/lib/utils/http-utils';
import { extractToolsUsed } from './utils/tool-utils';
import { standardizeMessages, extractMessageContent } from './utils/message-utils';

// Define schema for the parts array
const messagePartSchema = z.object({
    type: z.string(),
    text: z.string().optional(),
    // Allow other properties if needed for different part types
}).passthrough(); // Use passthrough if parts can have varying structures

// Corrected Zod schema for validating the request body
const chatRequestSchema = z.object({
    message: z.union([
        z.string(), // Allow simple string message
        z.object({  // Define the expected object structure
            id: z.string().optional(), // useChat might not send ID initially
            role: z.enum(['user', 'assistant', 'system', 'tool', 'function']),
            content: z.string().or(z.object({})).or(z.null()).optional(), // Content can be string, object, or null
            parts: z.array(messagePartSchema).optional(), // Parts array with defined structure
            createdAt: z.string().datetime().optional().or(z.date().optional()) // Allow date string or object
        }).passthrough() // Allow other potential fields from SDK
    ]).optional(),
    messages: z.array(z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant', 'system', 'tool', 'function']),
        content: z.string().or(z.object({})).or(z.null()),
        parts: z.array(messagePartSchema).optional(), // Add parts here too
        createdAt: z.string().datetime().optional().or(z.date().optional()) // Allow date string or object
    }).passthrough()).optional(),
    id: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    agentId: z.string().optional(),
    deepSearchEnabled: z.boolean().optional(),
    userId: z.string().optional() // Optional as it might come from auth instead
});

type ChatRequestBody = z.infer<typeof chatRequestSchema>;

/**
 * ChatEngineFacade - implements the facade pattern to orchestrate the chat flow
 */
export class ChatEngineFacade {
    private config: ChatEngineConfig;
    private apiAuthService: ApiAuthService;
    private chatContextService: ChatContextService;
    private aiStreamService: AIStreamService;
    private persistenceService: MessagePersistenceService;

    /**
     * Constructor accepting service instances (Dependency Injection)
     */
    constructor(
        config: ChatEngineConfig,
        apiAuthService: ApiAuthService,
        chatContextService: ChatContextService,
        aiStreamService: AIStreamService,
        persistenceService: MessagePersistenceService
    ) {
        // Apply default configuration
        this.config = {
            // Default values
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
            // Override with provided config
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
        }

        // Store service dependencies
        this.apiAuthService = apiAuthService;
        this.chatContextService = chatContextService;
        this.aiStreamService = aiStreamService;
        this.persistenceService = persistenceService;

        // Log initialization
        edgeLogger.info('Chat engine facade initialized', {
            category: LOG_CATEGORIES.SYSTEM,
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
     * Main method to handle incoming chat requests
     */
    public async handleRequest(req: Request): Promise<Response> {
        const operationId = `chat_${crypto.randomUUID().substring(0, 8)}`;
        const startTime = Date.now();

        // Parse and validate the request body
        let body: ChatRequestBody;
        let rawBodyForLogging: any;
        try {
            rawBodyForLogging = await req.json();
            // Add detailed logging BEFORE parsing
            edgeLogger.debug('Raw request body received', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: this.config.operationName,
                operationId,
                body: JSON.stringify(rawBodyForLogging) // Stringify to log cleanly
            });

            const result = chatRequestSchema.safeParse(rawBodyForLogging);

            if (!result.success) {
                // Log parsing error details
                edgeLogger.error('Zod schema validation failed', {
                    category: LOG_CATEGORIES.SYSTEM,
                    operation: this.config.operationName,
                    operationId,
                    error: JSON.stringify(result.error.format()), // Stringify the Zod error object
                    important: true
                });
                const errorResponse = new Response(
                    JSON.stringify({
                        error: 'Invalid request body',
                        details: result.error.format()
                    }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
                return handleCors(errorResponse, req, !!this.config.corsEnabled);
            }

            body = result.data;
            // Add detailed logging AFTER parsing
            edgeLogger.debug('Parsed request body (Zod)', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: this.config.operationName,
                operationId,
                parsedBody: JSON.stringify(body) // Log the successfully parsed body
            });
        } catch (error) {
            edgeLogger.error('Failed to parse JSON body', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: this.config.operationName,
                operationId,
                error: error instanceof Error ? error.message : String(error),
                rawBodyAttempted: JSON.stringify(rawBodyForLogging), // Log what we tried to parse
                important: true
            });
            const errorResponse = new Response(
                JSON.stringify({ error: 'Invalid JSON body' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
            return handleCors(errorResponse, req, !!this.config.corsEnabled);
        }

        // Extract key parameters
        const { message, messages, id, sessionId = crypto.randomUUID() } = body;

        // Add detailed logging for the extracted message object
        edgeLogger.debug('Extracted message object before standardization', {
            category: LOG_CATEGORIES.CHAT,
            operation: this.config.operationName,
            operationId,
            messageObject: JSON.stringify(message) // Log the exact object
        });

        // Validate the request
        if ((!message && !messages) || (!id && !sessionId)) {
            const errorResponse = new Response(
                JSON.stringify({ error: 'Missing required parameters' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
            return handleCors(errorResponse, req, !!this.config.corsEnabled);
        }

        // Authenticate the request
        let userId: string | undefined;
        try {
            userId = await this.apiAuthService.authenticateRequest(req, this.config.requiresAuth || false);
        } catch (authError) {
            if (authError instanceof Response) {
                return handleCors(authError, req, !!this.config.corsEnabled);
            }

            const errorResponse = new Response(
                JSON.stringify({
                    error: 'Authentication error',
                    message: authError instanceof Error ? authError.message : String(authError)
                }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
            return handleCors(errorResponse, req, !!this.config.corsEnabled);
        }

        // Use userId from auth, or from body as fallback (for testing/bypass)
        const contextUserId = userId || body.userId || (this.config.body?.userId as string);

        // Extract message content for logging and title generation
        let extractedContent: string = '';
        if (typeof message === 'string') {
            extractedContent = message;
        } else if (message && typeof message === 'object' && 'content' in message) {
            extractedContent = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        } else if (messages && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            extractedContent = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
        }

        // Create a timeout handler
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<Response>((resolve) => {
            timeoutId = setTimeout(() => {
                edgeLogger.error('Request timeout', {
                    category: LOG_CATEGORIES.SYSTEM,
                    operation: this.config.operationName,
                    operationId,
                    sessionId: id || sessionId,
                    important: true
                });

                resolve(
                    handleCors(
                        new Response(
                            JSON.stringify({ error: 'Request timeout' }),
                            { status: 504, headers: { 'Content-Type': 'application/json' } }
                        ),
                        req,
                        !!this.config.corsEnabled
                    )
                );
            }, 30000); // 30 second timeout
        });

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

        // Start end-to-end request tracking with chat logger
        const logContext = chatLogger.requestReceived({
            sessionId: id || sessionId,
            userId: contextUserId,
            messageId,
            agentType: body.agentId,
            deepSearchEnabled: body.deepSearchEnabled
        });

        // Process the request with logging context
        return withContext(logContext, async () => {
            try {
                // Validate message parameters and create chat message(s)
                let chatMessages: Message[] = [];

                if (messages && Array.isArray(messages)) {
                    // Use standardizeMessages to handle array of messages
                    chatMessages = standardizeMessages(messages, {
                        operationId,
                        validateRole: true,
                        preserveId: true
                    });
                    // Add logging for standardized array
                    edgeLogger.debug('Standardized message array', {
                        category: LOG_CATEGORIES.CHAT,
                        operation: this.config.operationName,
                        operationId,
                        standardized: JSON.stringify(chatMessages.slice(0, 1)) // Log first item sample
                    });
                } else if (message && typeof message === 'string') {
                    // Simple string message format
                    chatMessages = standardizeMessages({
                        id: messageId,
                        role: 'user',
                        content: message
                    }, {
                        operationId,
                        validateRole: false
                    });
                    edgeLogger.debug('Standardized string message', {
                        category: LOG_CATEGORIES.CHAT,
                        operation: this.config.operationName,
                        operationId,
                        message: message
                    });
                } else if (message && typeof message === 'object') {
                    // Single message object format (from Vercel AI SDK)
                    const messageObj = message as Record<string, any>; // Keep this casting for checks

                    // Add logging right before standardization for the object case
                    edgeLogger.debug('Standardizing single message object', {
                        category: LOG_CATEGORIES.CHAT,
                        operation: this.config.operationName,
                        operationId,
                        objectToStandardize: JSON.stringify(messageObj)
                    });

                    const hasParts = messageObj.parts && Array.isArray(messageObj.parts) && messageObj.parts.length > 0;
                    const hasContent = typeof messageObj.content === 'string' && messageObj.content.trim() !== '';

                    if (hasParts || hasContent) {
                        edgeLogger.debug('Message object has content or parts', {
                            category: LOG_CATEGORIES.CHAT,
                            operation: this.config.operationName,
                            operationId,
                            hasParts,
                            partsLength: hasParts ? messageObj.parts.length : 0,
                            hasContent,
                            contentPreview: hasContent ? messageObj.content.substring(0, 50) : 'none'
                        });
                    } else {
                        // This warning should ideally not trigger now with the corrected schema
                        edgeLogger.warn('Message object appears to have neither content nor parts AFTER parsing', {
                            category: LOG_CATEGORIES.CHAT,
                            operation: this.config.operationName,
                            operationId,
                            messageKeys: Object.keys(messageObj).join(',')
                        });
                    }

                    // Pass the potentially corrected message object
                    chatMessages = standardizeMessages(messageObj, {
                        operationId,
                        validateRole: true,
                        defaultRole: 'user',
                        preserveId: true
                    });

                    // Add logging right after standardization for the object case
                    edgeLogger.debug('Result of standardizing single message object', {
                        category: LOG_CATEGORIES.CHAT,
                        operation: this.config.operationName,
                        operationId,
                        standardized: JSON.stringify(chatMessages)
                    });
                } else {
                    chatLogger.error('Invalid message format', 'Format validation failed', {
                        messageType: typeof message
                    });
                    clearTimeout(timeoutId);
                    return handleCors(
                        new Response(
                            JSON.stringify({ error: 'Invalid message format' }),
                            { status: 400, headers: { 'Content-Type': 'application/json' } }
                        ),
                        req,
                        !!this.config.corsEnabled
                    );
                }

                // Safety check - make sure we have at least one valid message
                if (chatMessages.length === 0) {
                    edgeLogger.error('No valid messages after standardization', {
                        category: LOG_CATEGORIES.SYSTEM,
                        operation: this.config.operationName,
                        operationId,
                        important: true
                    });

                    // Add a default message to prevent failures
                    chatMessages = [{
                        id: crypto.randomUUID(),
                        role: 'user',
                        content: 'Hello',
                        createdAt: new Date()
                    }];
                } else {
                    // Log the FINAL standardized message content for debugging
                    edgeLogger.debug('Final standardized messages before context build', {
                        category: LOG_CATEGORIES.CHAT,
                        operation: this.config.operationName,
                        operationId,
                        messageCount: chatMessages.length,
                        // Log first message cleanly
                        sample: chatMessages.length > 0 ? JSON.stringify({
                            id: chatMessages[0].id,
                            role: chatMessages[0].role,
                            contentLength: chatMessages[0].content?.length ?? 0,
                            hasParts: !!(chatMessages[0] as any).parts
                        }) : 'none'
                    });
                }

                // Build the context using the context service
                const chatId = id || sessionId;
                const context = await this.chatContextService.buildContext(
                    chatMessages,
                    chatId,
                    contextUserId
                );

                // Enhanced validation - log any message format issues
                if (context.messages && context.messages.length > 0) {
                    // Log overall message structure for debugging
                    edgeLogger.debug('Messages before processing', {
                        category: LOG_CATEGORIES.SYSTEM,
                        operation: this.config.operationName,
                        operationId,
                        messageCount: context.messages.length,
                        messageRoles: context.messages.map(m => m.role).join(','),
                        firstMessageSample: JSON.stringify(context.messages[0]).substring(0, 150)
                    });
                }

                // Save the user message asynchronously (non-blocking)
                if (!this.config.messagePersistenceDisabled && contextUserId) {
                    // Get the content from the last user message
                    const userMessages = chatMessages.filter(m => m.role === 'user');
                    if (userMessages.length > 0) {
                        const lastUserMessage = userMessages[userMessages.length - 1];
                        const userContent = extractMessageContent(lastUserMessage);

                        // Fire and forget - don't await
                        this.persistenceService.saveUserMessage(
                            chatId,
                            userContent,
                            contextUserId,
                            lastUserMessage.id
                        ).catch(error => {
                            edgeLogger.error('Failed to save user message', {
                                category: LOG_CATEGORIES.SYSTEM,
                                operation: this.config.operationName,
                                operationId,
                                sessionId: chatId,
                                error: error instanceof Error ? error.message : String(error)
                            });
                        });
                    }
                }

                // Process the request using the AI stream service
                const response = await this.aiStreamService.process(
                    context,
                    {
                        model: this.config.model,
                        systemPrompt: this.config.systemPrompt,
                        tools: this.config.tools,
                        temperature: this.config.temperature,
                        maxTokens: this.config.maxTokens,
                        body: this.config.body,
                        operationName: this.config.operationName
                    },
                    {
                        // Define callback for when AI stream finishes
                        onStreamFinish: async ({ text, toolCalls, usage }) => {
                            // Extract tool usage information from the assistant's message
                            let toolsUsed = extractToolsUsed(text, this.config.operationName || 'chat_engine');

                            // Add tool calls from the AI SDK if available
                            if (toolCalls && toolCalls.length > 0) {
                                toolsUsed = {
                                    ...toolsUsed,
                                    api_tool_calls: toolCalls.map((call: ToolCall<string, any>) => {
                                        // The ToolCall type might vary based on the AI SDK version
                                        // Create a safely typed version
                                        return {
                                            name: call.toolName,
                                            callId: call.toolCallId || crypto.randomUUID().substring(0, 8),
                                            toolType: 'function'
                                        };
                                    })
                                };
                            }

                            // 1. Save the assistant's message
                            if (!this.config.messagePersistenceDisabled && contextUserId) {
                                this.persistenceService.saveAssistantMessage(
                                    chatId,
                                    text,
                                    contextUserId,
                                    toolsUsed
                                ).catch(error => {
                                    edgeLogger.error('Failed to save assistant message', {
                                        category: LOG_CATEGORIES.SYSTEM,
                                        operation: this.config.operationName,
                                        operationId,
                                        sessionId: chatId,
                                        error: error instanceof Error ? error.message : String(error)
                                    });
                                });
                            }

                            // 2. Trigger title generation for new conversations
                            // This should only happen for the first message exchange
                            // and only for non-widget chats (widgets handle their own sessions)
                            if ((context.previousMessages?.length === 0 || !context.previousMessages)
                                && !this.config.body?.isWidgetChat) {
                                triggerTitleGenerationViaApi(
                                    chatId,
                                    chatMessages[chatMessages.length - 1].content,
                                    contextUserId
                                ).catch(error => {
                                    edgeLogger.error('Failed to trigger title generation', {
                                        category: LOG_CATEGORIES.SYSTEM,
                                        operation: this.config.operationName,
                                        operationId,
                                        sessionId: chatId,
                                        error: error instanceof Error ? error.message : String(error)
                                    });
                                });
                            } else if (this.config.body?.isWidgetChat) {
                                edgeLogger.debug('Skipped title generation for widget chat', {
                                    category: LOG_CATEGORIES.SYSTEM,
                                    operation: this.config.operationName,
                                    operationId,
                                    sessionId: chatId
                                });
                            }

                            // 3. Log completion with chat logger
                            chatLogger.requestCompleted({
                                responseLength: text.length,
                                hasToolsUsed: !!toolsUsed?.tools?.length,
                                toolsCount: toolsUsed?.tools?.length || 0,
                                toolNames: toolsUsed?.tools?.map((t: string) => t) || [],
                                additionalData: {
                                    userId: contextUserId,
                                    messageId,
                                    tokensUsed: usage.totalTokens
                                }
                            });
                        }
                    }
                );

                // Clear the timeout and apply CORS headers if needed
                clearTimeout(timeoutId);
                return handleCors(response, req, !!this.config.corsEnabled);
            } catch (error) {
                // Cancel the timeout and return error response
                clearTimeout(timeoutId);

                // Log the error with chat logger for end-to-end timing
                chatLogger.error('Error handling chat request',
                    error instanceof Error ? error.message : String(error),
                    {
                        operation: this.config.operationName,
                        path: new URL(req.url).pathname,
                        agentType: body.agentId
                    });

                return handleCors(
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
                    req,
                    !!this.config.corsEnabled
                );
            }
        });
    }
}

/**
 * Factory function to create a new ChatEngineFacade with all required dependencies
 */
export function createChatEngine(config: ChatEngineConfig): ChatEngineFacade {
    // Initialize all required services
    const apiAuthService = new ApiAuthService(config.operationName);

    const persistenceService = new MessagePersistenceService({
        operationName: config.operationName,
        throwErrors: false,
        messageHistoryLimit: config.messageHistoryLimit,
        disabled: config.messagePersistenceDisabled,
        isWidgetChat: config.body?.isWidgetChat === true
    });

    const chatContextService = new ChatContextService(
        persistenceService,
        {
            messageHistoryLimit: config.messageHistoryLimit,
            messagePersistenceDisabled: config.messagePersistenceDisabled,
            operationName: config.operationName
        }
    );

    const aiStreamService = new AIStreamService();

    // Create and return the facade with injected dependencies
    return new ChatEngineFacade(
        config,
        apiAuthService,
        chatContextService,
        aiStreamService,
        persistenceService
    );
} 