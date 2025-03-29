/**
 * Message History Service
 * 
 * Manages conversation history persistence and retrieval,
 * abstracting the caching details from the chat engine.
 */

import { Message } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { chatEngineCache } from './cache-service';

// Interface for session data
export interface SessionData {
    messages: Message[];
    lastUpdated: number;
    userId?: string;
}

/**
 * MessageHistoryService class
 * Handles the loading and saving of conversation history
 */
export class MessageHistoryService {
    private readonly operationName: string;
    private readonly cacheEnabled: boolean;
    private readonly messageHistoryLimit: number;

    /**
     * Create a message history service
     * @param options Configuration options
     */
    constructor(options: {
        operationName?: string;
        cacheEnabled?: boolean;
        messageHistoryLimit?: number;
    } = {}) {
        this.operationName = options.operationName || 'message_history';
        this.cacheEnabled = options.cacheEnabled !== false;
        this.messageHistoryLimit = options.messageHistoryLimit || 50;
    }

    /**
     * Loads previous messages for a session from cache
     * @param sessionId - Session identifier
     * @returns Array of previous messages or undefined if not found
     */
    async loadPreviousMessages(sessionId: string): Promise<Message[] | undefined> {
        if (!this.cacheEnabled) {
            return undefined;
        }

        try {
            const cachedSession = await chatEngineCache.getSession(sessionId);

            if (cachedSession && Array.isArray(cachedSession.messages)) {
                edgeLogger.info('Loaded previous messages from cache', {
                    operation: this.operationName,
                    sessionId,
                    messageCount: cachedSession.messages.length
                });

                return cachedSession.messages;
            }

            return undefined;
        } catch (error) {
            edgeLogger.warn('Failed to load previous messages', {
                operation: this.operationName,
                sessionId,
                error: error instanceof Error ? error.message : String(error)
            });

            return undefined;
        }
    }

    /**
     * Saves messages to the session cache
     * @param sessionId - Session identifier
     * @param messages - Messages to save
     * @param userId - Optional user identifier
     */
    async saveMessages(sessionId: string, messages: Message[], userId?: string): Promise<void> {
        if (!this.cacheEnabled) {
            return;
        }

        try {
            // Load existing session first
            const existingSession = await chatEngineCache.getSession(sessionId) || {
                messages: [],
                lastUpdated: 0
            };

            // Combine previous messages with new ones
            const combinedMessages = [
                ...existingSession.messages,
                ...messages
            ];

            // Limit the number of messages to messageHistoryLimit
            const limitedMessages = combinedMessages.slice(-this.messageHistoryLimit);

            // Save updated session
            await chatEngineCache.setSession(sessionId, {
                messages: limitedMessages,
                lastUpdated: Date.now(),
                userId
            });

            edgeLogger.debug('Saved messages to cache', {
                operation: this.operationName,
                sessionId,
                messageCount: limitedMessages.length
            });
        } catch (error) {
            edgeLogger.error('Failed to save messages', {
                operation: this.operationName,
                sessionId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Get the most recent messages for a session
     * Combines previous messages with new ones, limiting by history size
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
        if (!this.cacheEnabled) {
            return currentMessages;
        }

        try {
            const previousMessages = await this.loadPreviousMessages(sessionId);

            if (previousMessages && previousMessages.length > 0) {
                // Take only the last few messages to stay within context limits
                const recentHistory = previousMessages.slice(-historyLimit);

                // Combine with current messages
                return [...recentHistory, ...currentMessages];
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

    /**
     * Add a placeholder message for the assistant's streaming response
     * @param sessionId Session identifier
     * @param messages Current messages array
     * @param userId Optional user identifier
     */
    async addPlaceholderAndSave(
        sessionId: string,
        messages: Message[],
        userId?: string
    ): Promise<void> {
        // Add assistant message placeholder - will be updated by client
        const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '[Streaming response]'
        };

        await this.saveMessages(
            sessionId,
            [...messages, assistantMessage],
            userId
        ).catch(error => {
            edgeLogger.error('Failed to save message placeholder', {
                operation: this.operationName,
                error: error instanceof Error ? error.message : String(error)
            });
        });
    }
}

/**
 * Create a message history service with the provided options
 * @param options Configuration options
 * @returns Configured MessageHistoryService
 */
export function createMessageHistoryService(options: {
    operationName?: string;
    cacheEnabled?: boolean;
    messageHistoryLimit?: number;
} = {}): MessageHistoryService {
    return new MessageHistoryService(options);
} 