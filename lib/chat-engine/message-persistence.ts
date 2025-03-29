/**
 * Message Persistence Service
 * 
 * This service handles saving chat messages to the database asynchronously,
 * ensuring the chat UI flow is never blocked by database operations.
 * It provides methods for saving both user and assistant messages using
 * the save_message_and_update_session RPC function.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Message } from 'ai';
import { createClient } from '@/utils/supabase/server';

// Import the supabase client or create a function to get it
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface MessagePersistenceConfig {
    disabled?: boolean;
    operationName?: string;
    throwErrors?: boolean;
    messageHistoryLimit?: number;
}

export interface HistoryMessageInput {
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string;
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
 * Service for persisting messages to the database
 * Uses the Supabase RPC function for message saving
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
     * Save a message to the database (deprecated version - will be removed soon)
     * @param message Message data to save
     * @param sessionId Session identifier
     * @param userId User identifier
     * @returns Result of the save operation, or null if persistence is disabled
     */
    async saveHistoryMessage(message: HistoryMessageInput, sessionId: string, userId: string | null): Promise<any | null> {
        // Skip if persistence is disabled
        if (this.config.disabled) {
            edgeLogger.info('Message persistence skipped (disabled)', {
                category: LOG_CATEGORIES.TOOLS,
                operation: this.operationName,
                sessionId,
                role: message.role,
                messageId: message.messageId
            });
            return null;
        }

        // Skip if no user ID and auth is required
        if (!userId) {
            edgeLogger.info('Message persistence skipped (no authentication)', {
                category: LOG_CATEGORIES.TOOLS,
                operation: this.operationName,
                sessionId,
                role: message.role,
                messageId: message.messageId
            });
            return null;
        }

        try {
            // Create Supabase client
            const supabase = await createClient();

            // Log the operation
            edgeLogger.info(`Saving ${message.role} message`, {
                category: LOG_CATEGORIES.TOOLS,
                operation: this.operationName,
                sessionId,
                role: message.role,
                userId,
                messageId: message.messageId,
                contentLength: message.content.length
            });

            const messageId = message.messageId || crypto.randomUUID();

            // Call the RPC function
            const { data, error } = await supabase.rpc(
                'save_message_and_update_session',
                {
                    p_session_id: sessionId,
                    p_role: message.role,
                    p_content: message.content,
                    p_user_id: userId,
                    p_message_id: messageId,
                    p_tools_used: message.tools ? JSON.stringify(message.tools) : null,
                    p_update_timestamp: true
                }
            );

            if (error) {
                edgeLogger.error(`Failed to save ${message.role} message via RPC`, {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: this.operationName,
                    sessionId,
                    role: message.role,
                    userId,
                    messageId,
                    error: error.message
                });

                // Throw if configured to do so
                if (this.throwErrors) {
                    throw error;
                }

                return {
                    success: false,
                    error: error.message
                };
            }

            // Log successful save
            edgeLogger.info(`${message.role} message saved successfully`, {
                category: LOG_CATEGORIES.TOOLS,
                operation: this.operationName,
                sessionId,
                role: message.role,
                userId,
                messageId
            });

            return data;
        } catch (error) {
            // Log error
            edgeLogger.error(`Error saving ${message.role} message`, {
                category: LOG_CATEGORIES.TOOLS,
                operation: this.operationName,
                sessionId,
                role: message.role,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });

            // Throw if configured to do so
            if (this.throwErrors) {
                throw error;
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }

    }

    /**
     * Save a message to the database
     * @param input Message data to save
     * @returns Result of the save operation
     */
    async saveMessage(input: HistoryMessageInput & { userId?: string }): Promise<MessageSaveResult> {
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

            // Safety check - verify user authentication if available
            if (!input.userId) {
                edgeLogger.warn('Saving message without user ID', {
                    operation: this.operationName,
                    messageId,
                    sessionId: input.sessionId
                });
            }

            edgeLogger.info('Saving message to database', {
                operation: this.operationName,
                sessionId: input.sessionId,
                role: input.role,
                userId: input.userId || 'anonymous',
                messageId,
                contentLength: input.content.length,
                hasToolsUsed: input.tools ? Object.keys(input.tools).length > 0 : false
            });

            // Create Supabase client
            const supabase = await createClient();

            // Call the Supabase RPC function to save the message
            const { data, error } = await supabase.rpc(
                'save_message_and_update_session',
                {
                    p_session_id: input.sessionId,
                    p_role: input.role,
                    p_content: input.content,
                    p_user_id: input.userId || '00000000-0000-0000-0000-000000000000', // Anonymous user ID if not provided
                    p_message_id: messageId,
                    p_tools_used: input.tools ? JSON.stringify(input.tools) : null,
                    p_update_timestamp: true
                }
            );

            // Log result
            if (error) {
                edgeLogger.error('Failed to save message to database', {
                    operation: this.operationName,
                    sessionId: input.sessionId,
                    messageId,
                    error: error.message,
                    details: error.details
                });

                if (this.throwErrors) {
                    throw new Error(`Failed to save message: ${error.message}`);
                }

                return {
                    success: false,
                    error: error.message
                };
            }

            // Extract execution time if available
            const executionTimeMs = data?.execution_time_ms || 0;

            edgeLogger.info('Message saved to database', {
                operation: this.operationName,
                sessionId: input.sessionId,
                messageId,
                executionTimeMs
            });

            return {
                success: true,
                messageId,
                message: 'Message saved successfully',
                executionTimeMs
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            edgeLogger.error('Error in saveMessage', {
                operation: this.operationName,
                sessionId: input.sessionId,
                error: errorMessage
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
     * Load previous messages for a session from the database
     * @param sessionId Session identifier
     * @param limit Maximum number of messages to return
     * @returns Array of previous messages or undefined if not found
     */
    async loadPreviousMessages(sessionId: string, limit?: number): Promise<Message[] | undefined> {
        const messageLimit = limit || this.messageHistoryLimit;

        try {
            edgeLogger.info('Loading messages from database', {
                operation: this.operationName,
                sessionId,
                limit: messageLimit
            });

            // Create Supabase client
            const supabase = await createClient();

            const { data, error } = await supabase
                .from('sd_chat_histories')
                .select('id, role, content, created_at, tools_used')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(messageLimit);

            if (error) {
                edgeLogger.error('Failed to load messages from database', {
                    operation: this.operationName,
                    sessionId,
                    error: error.message
                });

                return undefined;
            }

            if (!data || data.length === 0) {
                edgeLogger.info('No messages found for session', {
                    operation: this.operationName,
                    sessionId
                });

                return undefined;
            }

            // Convert database records to Message format
            const messages: Message[] = data.map((record: any) => ({
                id: record.id,
                role: record.role as Message['role'],
                content: record.content,
                // Include tools_used as extra data if available
                ...(record.tools_used ? { tools_used: record.tools_used } : {})
            }));

            edgeLogger.info('Loaded messages from database', {
                operation: this.operationName,
                sessionId,
                messageCount: messages.length
            });

            return messages;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            edgeLogger.error('Error in loadPreviousMessages', {
                operation: this.operationName,
                sessionId,
                error: errorMessage
            });

            return undefined;
        }
    }

    /**
     * Get the most recent messages for a session
     * @param sessionId - Session identifier
     * @param currentMessages - Current messages in the conversation
     * @param historyLimit - Optional limit on history size
     * @returns Combined messages array
     */
    async getRecentHistory(
        sessionId: string,
        currentMessages: Message[],
        historyLimit: number = 10
    ): Promise<Message[]> {
        try {
            const previousMessages = await this.loadPreviousMessages(sessionId, historyLimit);

            if (previousMessages && previousMessages.length > 0) {
                // Combine with current messages
                return [...previousMessages, ...currentMessages];
            }
        } catch (error) {
            edgeLogger.error('Failed to get recent history', {
                operation: this.operationName,
                sessionId,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        return currentMessages;
    }
} 