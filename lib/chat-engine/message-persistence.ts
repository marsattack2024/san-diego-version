/**
 * Message Persistence Service
 * 
 * This service handles saving chat messages to the database asynchronously,
 * ensuring the chat UI flow is never blocked by database operations.
 * It provides methods for saving both user and assistant messages using
 * direct database operations while respecting Row Level Security policies.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Message } from 'ai';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server';
import { v4 as uuid } from 'uuid';
import { SupabaseClient } from '@supabase/supabase-js';

// IMPORTANT: We should not create a direct client here.
// The createClient() function should handle proper authentication
// and return a fully authenticated client.

export interface MessagePersistenceConfig {
    operationName?: string;
    throwErrors?: boolean;
    messageHistoryLimit?: number;
    isWidgetChat?: boolean;
    disabled?: boolean;
    bypassAuth?: boolean;
    defaultUserId?: string;
}

export interface HistoryMessageInput {
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string;
    userId?: string;
    messageId?: string;
    tools?: ToolsUsedData;
}

/**
 * Interface defining the structure of tool usage data
 */
export interface ToolsUsedData {
    // From text extraction
    tools?: string[];

    // From AI SDK tool calls
    api_tool_calls?: Array<{
        name?: string;
        id: string;
        type: string;
    }>;

    // Any additional tool information 
    [key: string]: any;
}

export interface MessageSaveResult {
    success: boolean;
    message?: string;
    error?: string;
    messageId?: string;
    executionTimeMs?: number;
}

/**
 * Helper function to log errors consistently
 */
function logError(logger: typeof edgeLogger, operation: string, error: unknown, context: Record<string, any> = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`Error in ${operation}`, {
        operation,
        error: errorMessage,
        stack: errorStack,
        ...context
    });

    return errorMessage;
}

/**
 * Implements a simple retry mechanism for database operations
 * @param operation Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param baseDelayMs Base delay between retries in milliseconds (will be exponentially increased)
 * @returns Result of the operation or throws after all retries are exhausted
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 200
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Only retry on potentially transient errors
            if (error instanceof Error) {
                const errorMessage = error.message.toLowerCase();
                const isTransient =
                    errorMessage.includes('network') ||
                    errorMessage.includes('timeout') ||
                    errorMessage.includes('connection') ||
                    errorMessage.includes('rate limit') ||
                    error.name === 'AbortError';

                if (!isTransient) {
                    throw error; // Don't retry on non-transient errors
                }
            }

            // Exponential backoff with jitter
            const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;

            // Log retry attempt
            edgeLogger.warn(`Retrying database operation (${attempt + 1}/${maxRetries}) after ${delayMs.toFixed(0)}ms`, {
                operation: 'database_retry',
                attempt: attempt + 1,
                maxRetries,
                delayMs: Math.round(delayMs),
                error: lastError instanceof Error ? lastError.message : String(lastError)
            });

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    // If we get here, all retries failed
    throw lastError;
}

/**
 * Service for persisting messages to the database
 * Uses direct Supabase operations with appropriate error handling
 */
export class MessagePersistenceService {
    private readonly operationName: string;
    private readonly throwErrors: boolean;
    private readonly messageHistoryLimit: number;
    private readonly isWidgetChat: boolean;
    private readonly disabled: boolean;
    private readonly bypassAuth: boolean;
    private readonly defaultUserId?: string;

    constructor(config: MessagePersistenceConfig = {}) {
        // Store config values directly in class properties
        this.operationName = config.operationName || 'message_persistence';
        this.throwErrors = config.throwErrors === true;
        this.messageHistoryLimit = config.messageHistoryLimit || 50;
        this.isWidgetChat = config.isWidgetChat || false;
        this.disabled = config.disabled || false;
        this.bypassAuth = config.bypassAuth || false;
        this.defaultUserId = config.defaultUserId;

        if (this.disabled) {
            edgeLogger.info('Message persistence disabled', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: this.operationName,
                reason: this.isWidgetChat ? 'widget_chat' : 'configuration',
            });
        }

        // Log initialization
        edgeLogger.debug('Message persistence service initialized', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: this.operationName,
            messageHistoryLimit: this.messageHistoryLimit,
            throwErrors: this.throwErrors,
            isWidgetChat: this.isWidgetChat,
            disabled: this.disabled
        });
    }

    /**
     * Creates a Supabase client based on configuration
     */
    private async createSupabaseClient(context: Record<string, any> = {}): Promise<SupabaseClient> {
        const useAdminClient = this.bypassAuth === true;
        try {
            if (useAdminClient) {
                edgeLogger.info('Using admin client to bypass RLS', {
                    operation: this.operationName,
                    ...context
                });
                return await createAdminClient();
            } else {
                return await createClient();
            }
        } catch (error) {
            edgeLogger.error('Failed to create Supabase client', {
                operation: this.operationName,
                error: error instanceof Error ? error.message : String(error),
                ...context
            });
            throw error;
        }
    }

    /**
     * Save a message to the database
     * @param input Message data to save
     * @returns Result of the save operation
     */
    async saveMessage(input: HistoryMessageInput & { userId?: string }): Promise<MessageSaveResult> {
        const startTime = Date.now();
        try {
            // Generate a message ID if not provided
            const messageId = input.messageId || crypto.randomUUID();

            // Skip if persistence is disabled
            if (this.disabled) {
                edgeLogger.info('Message persistence skipped (disabled)', {
                    operation: this.operationName,
                    sessionId: input.sessionId,
                    role: input.role,
                    messageId
                });

                return {
                    success: true,
                    messageId,
                    message: 'Message persistence skipped (disabled)'
                };
            }

            // If we don't have a userId, we can't save the message
            if (!input.userId) {
                edgeLogger.warn('Cannot save message without user ID', {
                    operation: this.operationName,
                    messageId,
                    sessionId: input.sessionId
                });

                return {
                    success: false,
                    messageId,
                    error: 'Cannot save message without user ID'
                };
            }

            edgeLogger.info('Saving message to database', {
                operation: this.operationName,
                sessionId: input.sessionId,
                role: input.role,
                userId: input.userId,
                messageId,
                contentLength: input.content.length,
                hasToolsUsed: input.tools ? Object.keys(input.tools).length > 0 : false
            });

            // Create Supabase client
            const supabase = await this.createSupabaseClient({
                sessionId: input.sessionId,
                action: 'save_message'
            });

            // First, try to save via RPC function
            try {
                const { data: rpcResult, error: rpcError } = await supabase
                    .rpc('save_message_and_update_session', {
                        p_session_id: input.sessionId,
                        p_role: input.role,
                        p_content: input.content,
                        p_user_id: input.userId,
                        p_message_id: messageId,
                        p_tools_used: input.tools || null,
                        p_update_timestamp: true
                    });

                if (rpcError) {
                    edgeLogger.error('RPC failed to save message', {
                        operation: this.operationName,
                        sessionId: input.sessionId,
                        messageId,
                        error: rpcError.message,
                        code: rpcError.code,
                        details: rpcError.details || rpcError.message
                    });

                    // Try the direct insert as fallback
                    try {
                        await withRetry(async () => {
                            const { error: insertError } = await supabase
                                .from('sd_chat_histories')
                                .insert({
                                    id: messageId,
                                    session_id: input.sessionId,
                                    role: input.role,
                                    content: input.content,
                                    user_id: input.userId,
                                    tools_used: input.tools
                                });

                            if (insertError) {
                                // Convert database errors to JS errors for the retry mechanism
                                throw new Error(`Database insert failed: ${insertError.message}`);
                            }

                            return true;
                        });

                        // If we reach here, the insert succeeded with retries

                        // Update session timestamp as a fallback
                        const { error: updateSessionError } = await supabase
                            .from('sd_chat_sessions')
                            .upsert({
                                id: input.sessionId,
                                user_id: input.userId,
                                title: 'New Chat',
                                updated_at: new Date().toISOString()
                            });

                        if (updateSessionError) {
                            edgeLogger.warn('Failed to update session timestamp', {
                                operation: this.operationName,
                                sessionId: input.sessionId,
                                error: updateSessionError.message
                            });
                        }

                        // Continue despite error updating timestamp since the message was saved
                        const executionTime = Date.now() - startTime;
                        edgeLogger.info('Message saved with direct insert with retry (RPC failed)', {
                            operation: this.operationName,
                            sessionId: input.sessionId,
                            messageId,
                            executionTimeMs: executionTime
                        });

                        return {
                            success: true,
                            messageId,
                            message: 'Message saved with direct insert (RPC failed)',
                            executionTimeMs: executionTime
                        };
                    } catch (insertRetryError) {
                        edgeLogger.error('Failed to save message after retry attempts', {
                            operation: this.operationName,
                            sessionId: input.sessionId,
                            messageId,
                            error: insertRetryError instanceof Error ? insertRetryError.message : String(insertRetryError)
                        });

                        return {
                            success: false,
                            messageId,
                            error: `Message save failed after retries: ${insertRetryError instanceof Error ? insertRetryError.message : String(insertRetryError)}`
                        };
                    }
                }

                // RPC was successful
                const executionTime = Date.now() - startTime;
                edgeLogger.info('Message saved successfully via RPC', {
                    operation: this.operationName,
                    sessionId: input.sessionId,
                    messageId,
                    executionTimeMs: executionTime,
                    rpcSuccess: rpcResult?.success === true
                });

                return {
                    success: true,
                    messageId,
                    message: 'Message saved successfully via RPC',
                    executionTimeMs: executionTime
                };
            } catch (error) {
                const errorMessage = logError(edgeLogger, this.operationName, error, {
                    sessionId: input.sessionId,
                    action: 'save_message_exception'
                });

                return {
                    success: false,
                    messageId,
                    error: `Exception when saving message: ${errorMessage}`,
                    executionTimeMs: Date.now() - startTime
                };
            }
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = logError(edgeLogger, this.operationName, error, {
                sessionId: input.sessionId,
                executionTimeMs,
                action: 'save_message_outer'
            });

            if (this.throwErrors) {
                throw error;
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Load previous messages from a chat session
     * 
     * @param sessionId - The chat session ID to load messages from
     * @param userId - The user ID (required for RLS policies)
     * @param limit - Maximum number of messages to load (default: 100)
     * @returns Array of Message objects or empty array if none found
     */
    async loadPreviousMessages(
        sessionId: string,
        userId: string | undefined,
        limit = 100
    ): Promise<Message[]> {
        const startTime = Date.now();
        try {
            // Skip if persistence is disabled
            if (this.disabled) {
                edgeLogger.info('Loading previous messages skipped (disabled)', {
                    operation: this.operationName,
                    sessionId
                });
                return [];
            }

            if (!userId) {
                edgeLogger.warn('Loading messages without user ID may fail due to RLS', {
                    operation: this.operationName,
                    sessionId
                });
            }

            edgeLogger.info('Loading previous messages', {
                operation: this.operationName,
                sessionId,
                userId,
                limit
            });

            // Create Supabase client
            const supabase = await this.createSupabaseClient({
                sessionId,
                userId,
                limit,
                method: 'loadPreviousMessages'
            });

            // Direct query approach (removing RPC attempt since it doesn't exist)
            const { data: historyData, error } = await supabase
                .from('sd_chat_histories')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) {
                edgeLogger.error('Failed to load messages', {
                    operation: this.operationName,
                    sessionId,
                    error: error.message,
                    code: error.code,
                    details: error.details
                });
                return [];
            }

            if (!historyData || historyData.length === 0) {
                edgeLogger.info('No previous messages found', {
                    operation: this.operationName,
                    sessionId
                });
                return [];
            }

            // Convert from database format to Message format
            const messages: Message[] = historyData.map(record => {
                // Content is now expected to be plain text directly from DB
                return {
                    id: record.id,
                    role: record.role as "user" | "assistant",
                    content: record.content, // Use content directly
                    createdAt: new Date(record.created_at),
                    tools: record.tools_used
                };
            });

            edgeLogger.info('Messages loaded successfully', {
                operation: this.operationName,
                sessionId,
                count: messages.length,
                executionTimeMs: Date.now() - startTime
            });

            return messages;
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            logError(edgeLogger, this.operationName, error, {
                sessionId,
                executionTimeMs,
                action: 'load_messages'
            });

            if (this.throwErrors) {
                throw error;
            }

            return [];
        }
    }

    /**
     * Get the most recent messages for a session
     * @param sessionId - Session identifier
     * @param userId - User identifier (required for RLS policies) 
     * @param currentMessages - Current messages in the conversation
     * @param historyLimit - Optional limit on history size
     * @returns Combined messages array
     */
    async getRecentHistory(
        sessionId: string,
        userId: string,
        currentMessages: Message[],
        historyLimit: number = 10
    ): Promise<Message[]> {
        try {
            if (!userId) {
                edgeLogger.warn('Cannot get recent history without user ID', {
                    operation: this.operationName,
                    sessionId
                });
                return currentMessages;
            }

            edgeLogger.info('Getting recent history', {
                operation: this.operationName,
                sessionId,
                userId,
                currentMessageCount: currentMessages.length,
                historyLimit
            });

            const previousMessages = await this.loadPreviousMessages(sessionId, userId, historyLimit);

            if (previousMessages && previousMessages.length > 0) {
                edgeLogger.info('Combined messages with history', {
                    operation: this.operationName,
                    sessionId,
                    previousCount: previousMessages.length,
                    currentCount: currentMessages.length,
                    totalCount: previousMessages.length + currentMessages.length
                });

                // Combine with current messages
                return [...previousMessages, ...currentMessages];
            } else {
                edgeLogger.info('No history found, using current messages only', {
                    operation: this.operationName,
                    sessionId,
                    currentCount: currentMessages.length
                });
            }
        } catch (error) {
            logError(edgeLogger, this.operationName, error, {
                sessionId,
                action: 'get_recent_history'
            });
        }

        return currentMessages;
    }

    /**
     * Process tool usage data from different sources into a standard format
     * @param toolsUsed Initial tools data (if available)
     * @param content Content that might contain embedded tool calls
     * @returns Standardized tools metadata
     */
    private setupToolsMetadata(
        toolsUsed?: Record<string, any>,
        content?: string | any
    ): ToolsUsedData | undefined {
        // If no toolsUsed provided and no content with potential tool data, return undefined
        if (!toolsUsed && (!content || typeof content !== 'object')) {
            return undefined;
        }

        // Start with existing toolsUsed data
        let result: ToolsUsedData = { ...(toolsUsed || {}) };

        try {
            // Extract tool calls from AI SDK response object if present
            if (content && typeof content === 'object' && content.choices?.[0]?.message?.tool_calls) {
                const aiToolCalls = content.choices[0].message.tool_calls;

                if (aiToolCalls && aiToolCalls.length > 0) {
                    result = {
                        ...result,
                        api_tool_calls: [
                            ...(result.api_tool_calls || []),
                            ...aiToolCalls.map((tool: any) => ({
                                name: tool.function?.name,
                                id: tool.id,
                                type: tool.type
                            }))
                        ]
                    };
                }
            }
        } catch (error) {
            // Log but don't fail the entire operation for tool extraction issues
            edgeLogger.warn('Error extracting tool calls from content', {
                operation: this.operationName,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }

    /**
     * Format content for storage, ensuring only plain text is returned.
     * @param content Content to format (string or AI SDK structured object/array)
     * @returns Formatted content string (extracted text)
     */
    private formatContent(content: string | any): string {
        // If it's already a string, return it directly
        if (typeof content === 'string') {
            return content;
        }

        // Attempt to extract text if it follows the Vercel AI SDK structure
        try {
            // Check if it's the array structure like [{type: 'text', text: '...'}]
            if (Array.isArray(content) && content.length > 0 && content[0].type === 'text' && typeof content[0].text === 'string') {
                return content[0].text;
            }

            // Handle potential plain object structure if needed (adjust check as necessary)
            // else if (typeof content === 'object' && content !== null && content.type === 'text' && typeof content.text === 'string') {
            //     return content.text;
            // }

            // If it's not a known structure or string, try stringifying as a fallback
            edgeLogger.warn('[formatContent] Content is not a string or known structure, attempting JSON.stringify', {
                operation: this.operationName,
                contentType: typeof content
            });
            return JSON.stringify(content); // Fallback stringify
        } catch (error) {
            // Final fallback if stringify fails
            edgeLogger.warn('[formatContent] Error processing content, using String() fallback', {
                operation: this.operationName,
                error: error instanceof Error ? error.message : String(error)
            });
            return String(content);
        }
    }

    /**
     * Save a user message to the database
     * Adapts the original saveUserMessage method from the ChatEngine
     * 
     * @param sessionId Chat session ID
     * @param content Message content (string or object)
     * @param userId User ID (required for database RLS)
     * @param messageId Optional message ID (will generate UUID if not provided)
     * @returns Promise with save operation result
     */
    async saveUserMessage(
        sessionId: string,
        content: string | any,
        userId?: string,
        messageId?: string
    ): Promise<MessageSaveResult> {
        const startTime = Date.now();
        const operationId = `save_user_msg_${Math.random().toString(36).substring(2, 8)}`;

        // Skip if persistence is disabled
        if (this.disabled) {
            edgeLogger.info('User message persistence skipped (disabled)', {
                operation: this.operationName,
                operationId,
                sessionId
            });
            return {
                success: true,
                messageId: messageId || crypto.randomUUID(),
                message: 'Message persistence skipped (disabled)',
                executionTimeMs: Date.now() - startTime
            };
        }

        // Check for userId - required for RLS policies
        if (!userId) {
            edgeLogger.warn('No userId provided for message persistence', {
                operation: this.operationName,
                operationId,
                sessionId
            });
            return {
                success: false,
                messageId: messageId || crypto.randomUUID(),
                error: 'No userId provided for message persistence',
                executionTimeMs: Date.now() - startTime
            };
        }

        // Format content properly
        const formattedContent = this.formatContent(content);
        const finalMessageId = messageId || crypto.randomUUID();

        // Log the operation
        edgeLogger.info('Saving user message', {
            operation: this.operationName,
            operationId,
            sessionId,
            userId,
            messageId: finalMessageId,
            contentPreview: formattedContent.substring(0, 50) + (formattedContent.length > 50 ? '...' : '')
        });

        try {
            // Use the existing saveMessage method with retry
            return await withRetry(async () => {
                const result = await this.saveMessage({
                    sessionId,
                    userId,
                    role: 'user',
                    content: formattedContent,
                    messageId: finalMessageId
                });

                return {
                    ...result,
                    executionTimeMs: Date.now() - startTime
                };
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            edgeLogger.error('Failed to save user message', {
                operation: this.operationName,
                operationId,
                sessionId,
                userId,
                messageId: finalMessageId,
                error: errorMessage,
                executionTimeMs: Date.now() - startTime
            });

            return {
                success: false,
                messageId: finalMessageId,
                error: errorMessage,
                executionTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * Save an assistant message to the database with potential tool usage data
     * Adapts the original saveAssistantMessage method from the ChatEngine
     * 
     * @param sessionId Chat session ID
     * @param content Message content (string or object that might contain tool calls)
     * @param userId User ID (required for database RLS)
     * @param toolsUsed Optional tool usage data to be stored
     * @param messageId Optional message ID (will generate UUID if not provided)
     * @returns Promise with save operation result
     */
    async saveAssistantMessage(
        sessionId: string,
        content: string | any,
        userId?: string,
        toolsUsed?: Record<string, any>,
        messageId?: string
    ): Promise<MessageSaveResult> {
        const startTime = Date.now();
        const operationId = `save_assistant_msg_${Math.random().toString(36).substring(2, 8)}`;

        // Skip if persistence is disabled
        if (this.disabled) {
            edgeLogger.info('Assistant message persistence skipped (disabled)', {
                operation: this.operationName,
                operationId,
                sessionId
            });
            return {
                success: true,
                messageId: messageId || crypto.randomUUID(),
                message: 'Message persistence skipped (disabled)',
                executionTimeMs: Date.now() - startTime
            };
        }

        // Check for userId - required for RLS policies
        if (!userId) {
            edgeLogger.warn('No userId provided for message persistence', {
                operation: this.operationName,
                operationId,
                sessionId
            });
            return {
                success: false,
                messageId: messageId || crypto.randomUUID(),
                error: 'No userId provided for message persistence',
                executionTimeMs: Date.now() - startTime
            };
        }

        // Format content properly
        const formattedContent = this.formatContent(content);
        const finalMessageId = messageId || crypto.randomUUID();

        // Process tool usage data
        const processedTools = this.setupToolsMetadata(toolsUsed, content);

        // Enhanced logging with detailed tool usage information
        edgeLogger.info('Saving assistant message', {
            operation: this.operationName,
            operationId,
            sessionId,
            userId,
            messageId: finalMessageId,
            contentPreview: formattedContent.substring(0, 50) + (formattedContent.length > 50 ? '...' : ''),
            hasToolsUsed: !!processedTools,
            toolsCount: processedTools?.api_tool_calls?.length || 0,
            toolNames: processedTools?.api_tool_calls?.map((t: { name?: string }) => t.name).filter(Boolean) || []
        });

        try {
            // Use the existing saveMessage method with retry
            return await withRetry(async () => {
                const result = await this.saveMessage({
                    sessionId,
                    userId,
                    role: 'assistant',
                    content: formattedContent,
                    messageId: finalMessageId,
                    tools: processedTools
                });

                return {
                    ...result,
                    executionTimeMs: Date.now() - startTime
                };
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            edgeLogger.error('Failed to save assistant message', {
                operation: this.operationName,
                operationId,
                sessionId,
                userId,
                messageId: finalMessageId,
                error: errorMessage,
                hasToolsUsed: !!processedTools,
                executionTimeMs: Date.now() - startTime
            });

            return {
                success: false,
                messageId: finalMessageId,
                error: errorMessage,
                executionTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * Load messages from a chat session
     * 
     * @param sessionId - The chat session ID
     * @param userId - Optional user ID (for authentication)
     * @param limit - Maximum number of messages to load
     * @returns Array of messages or empty array if disabled or none found
     */
    async loadMessages(
        sessionId: string,
        userId?: string,
        limit?: number
    ): Promise<Message[]> {
        // Skip database query if persistence is disabled (like for widget chats)
        if (this.disabled) {
            if (this.isWidgetChat) {
                edgeLogger.debug('Skipping message loading for widget chat (client-side storage)', {
                    category: LOG_CATEGORIES.SYSTEM,
                    operation: this.operationName,
                    sessionId
                });
            } else {
                edgeLogger.info('Loading previous messages skipped (disabled)', {
                    operation: this.operationName,
                    sessionId: sessionId || 'unknown'
                });
            }
            return [];
        }

        // For non-disabled case, delegate to actual implementation
        return this.loadPreviousMessages(
            sessionId,
            userId || this.defaultUserId,
            limit || this.messageHistoryLimit
        );
    }
} 