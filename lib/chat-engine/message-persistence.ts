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

// IMPORTANT: We should not create a direct client here.
// The createClient() function should handle proper authentication
// and return a fully authenticated client.

export interface MessagePersistenceConfig {
    disabled?: boolean;
    bypassAuth?: boolean;
    defaultUserId?: string;
    operationName?: string;
    throwErrors?: boolean;
    messageHistoryLimit?: number;
}

export interface HistoryMessageInput {
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string;
    userId?: string;
    messageId?: string;
    tools?: Record<string, any>;
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
 * Service for persisting messages to the database
 * Uses direct Supabase operations with appropriate error handling
 */
export class MessagePersistenceService {
    private config: MessagePersistenceConfig;
    private readonly operationName: string;
    private readonly throwErrors: boolean;
    private readonly messageHistoryLimit: number;

    constructor(config: MessagePersistenceConfig = {}) {
        this.config = {
            disabled: false,
            operationName: 'message_persistence',
            throwErrors: false,
            messageHistoryLimit: 50,
            ...config
        };

        this.operationName = this.config.operationName || 'message_persistence';
        this.throwErrors = this.config.throwErrors === true;
        this.messageHistoryLimit = this.config.messageHistoryLimit || 50;

        // Log initialization
        edgeLogger.info('Message persistence service initialized', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: this.operationName,
            disabled: this.config.disabled
        });
    }

    /**
     * Creates a Supabase client based on configuration
     * Uses admin client if bypassAuth is true, with fallback to standard client
     */
    private async createSupabaseClient(context: Record<string, any> = {}) {
        const useAdminClient = this.config.bypassAuth === true;
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
            logError(edgeLogger, this.operationName, error, {
                useAdminClient,
                ...context,
                action: 'creating_client'
            });

            // Fall back to the standard client if admin client fails
            if (useAdminClient) {
                edgeLogger.info('Falling back to standard client', {
                    operation: this.operationName
                });
                return await createClient();
            }
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
            if (this.config.disabled) {
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
                        edgeLogger.error('Failed to save message with direct insert', {
                            operation: this.operationName,
                            sessionId: input.sessionId,
                            messageId,
                            error: insertError.message,
                            code: insertError.code
                        });

                        return {
                            success: false,
                            messageId,
                            error: `Message save failed: ${insertError.message}`
                        };
                    }

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
                    edgeLogger.info('Message saved with direct insert (RPC failed)', {
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
            if (this.config.disabled) {
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
                action: 'load_messages'
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
            const messages: Message[] = historyData.map(record => ({
                id: record.id,
                role: record.role as "user" | "assistant",
                content: record.content,
                createdAt: new Date(record.created_at),
                tools: record.tools_used
            }));

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
} 