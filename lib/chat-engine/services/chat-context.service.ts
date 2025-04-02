import { Message } from 'ai';
import { ChatEngineContext } from '@/lib/chat-engine/types';
import { MessagePersistenceService } from '@/lib/chat-engine/message-persistence';
import { extractUrls } from '@/lib/utils/url-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { ChatEngineConfig } from '../chat-engine.config'; // Correct import path for config

/**
 * Service responsible for creating the operational context for a chat request.
 * This includes generating request IDs, extracting URLs, and loading message history.
 */
export class ChatContextService {
    private persistenceService: MessagePersistenceService;
    private config: Pick<ChatEngineConfig, 'messageHistoryLimit' | 'messagePersistenceDisabled' | 'operationName'>;

    // Phase 8: Use dependency injection properly
    // constructor(persistenceService: MessagePersistenceService, config: ...) { ... }
    // TEMPORARY: Accept persistence service and relevant config directly
    constructor(
        persistenceService: MessagePersistenceService,
        config: Pick<ChatEngineConfig, 'messageHistoryLimit' | 'messagePersistenceDisabled' | 'operationName'>
    ) {
        this.persistenceService = persistenceService;
        this.config = config;
    }

    /**
     * Builds the ChatEngineContext for a given request.
     *
     * @param messages - The current messages in the request (e.g., latest user message).
     * @param sessionId - The identifier for the chat session.
     * @param userId - The authenticated user's ID (required for loading history).
     * @returns A promise resolving to the populated ChatEngineContext.
     */
    async buildContext(
        messages: Message[],
        sessionId: string,
        userId?: string
    ): Promise<ChatEngineContext> {
        const operationName = this.config.operationName || 'chat_context_build';
        const requestId = crypto.randomUUID();
        const startTime = Date.now();

        edgeLogger.debug('Building chat context', {
            category: LOG_CATEGORIES.CHAT, // Or SYSTEM?
            operation: operationName,
            sessionId,
            userId: userId ? maskUserId(userId) : 'anonymous',
            messageCount: messages.length
        });

        // Extract URLs from the latest user message
        const lastUserMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const urls = lastUserMessage?.role === 'user' && typeof lastUserMessage.content === 'string'
            ? extractUrls(lastUserMessage.content)
            : [];

        // Validate and fix messages to ensure they have proper structure
        const validatedMessages: Message[] = messages.map((msg, index) => {
            // Skip completely empty messages or non-object messages
            if (!msg || typeof msg !== 'object') {
                edgeLogger.error('Invalid message object detected, removing from context', {
                    category: LOG_CATEGORIES.CHAT,
                    operation: operationName,
                    sessionId,
                    messageIndex: index,
                    messageType: typeof msg
                });
                return null;
            }

            // Create a new object to avoid modifying the original
            const validMsg: any = { ...msg };

            // Ensure message has a valid role
            const validRoles = ['user', 'assistant', 'system', 'tool', 'function'];
            if (!validMsg.role || !validRoles.includes(validMsg.role)) {
                edgeLogger.warn('Fixing invalid message role', {
                    category: LOG_CATEGORIES.CHAT,
                    operation: operationName,
                    sessionId,
                    messageIndex: index,
                    invalidRole: validMsg.role
                });
                // Default to user role if missing or invalid
                validMsg.role = 'user';
            }

            // Ensure message has content and it's a string for user/assistant/system roles
            if (validMsg.content === undefined || validMsg.content === null) {
                // Check if there are parts with text
                if (validMsg.parts && Array.isArray(validMsg.parts) && validMsg.parts.length > 0) {
                    const textPart = validMsg.parts.find((part: any) =>
                        part && part.type === 'text' && typeof part.text === 'string');

                    if (textPart && textPart.text) {
                        validMsg.content = textPart.text;
                        edgeLogger.debug('Extracted content from parts array', {
                            category: LOG_CATEGORIES.CHAT,
                            operation: operationName,
                            sessionId,
                            messageIndex: index,
                            contentLength: validMsg.content.length
                        });
                    } else {
                        validMsg.content = '';
                        edgeLogger.warn('Fixing missing message content', {
                            category: LOG_CATEGORIES.CHAT,
                            operation: operationName,
                            sessionId,
                            messageIndex: index,
                            messageRole: validMsg.role
                        });
                    }
                } else {
                    validMsg.content = '';
                    edgeLogger.warn('Fixing missing message content', {
                        category: LOG_CATEGORIES.CHAT,
                        operation: operationName,
                        sessionId,
                        messageIndex: index,
                        messageRole: validMsg.role
                    });
                }
            }

            // For user/assistant/system messages, content must be a string
            if (['user', 'assistant', 'system'].includes(validMsg.role) &&
                typeof validMsg.content !== 'string') {
                edgeLogger.warn('Converting non-string content to string', {
                    category: LOG_CATEGORIES.CHAT,
                    operation: operationName,
                    sessionId,
                    messageIndex: index,
                    contentType: typeof validMsg.content
                });

                try {
                    // Try to convert content to string
                    validMsg.content = typeof validMsg.content === 'object' ?
                        JSON.stringify(validMsg.content) : String(validMsg.content || '');
                } catch (error) {
                    validMsg.content = '';
                }
            }

            // Ensure message has an ID
            if (!validMsg.id) {
                validMsg.id = crypto.randomUUID();
            }

            return validMsg;
        }).filter(Boolean) as Message[]; // Filter out null values from invalid messages

        // Log if any messages were removed during validation
        if (messages.length !== validatedMessages.length) {
            edgeLogger.error('Some messages were removed during validation', {
                category: LOG_CATEGORIES.CHAT,
                operation: operationName,
                sessionId,
                originalCount: messages.length,
                validatedCount: validatedMessages.length,
                removedCount: messages.length - validatedMessages.length
            });
        }

        // Safety check - if all messages were filtered out, add a default user message
        if (validatedMessages.length === 0 && messages.length > 0) {
            edgeLogger.error('All messages were invalid, adding default message', {
                category: LOG_CATEGORIES.CHAT,
                operation: operationName,
                sessionId,
                requestId,
                important: true
            });

            validatedMessages.push({
                id: crypto.randomUUID(),
                role: 'user',
                content: 'Hello'
            });
        }

        // Load previous messages if persistence is enabled and user is authenticated
        let previousMessages: Message[] | undefined;
        const shouldLoadHistory = userId && sessionId && !this.config.messagePersistenceDisabled;

        if (shouldLoadHistory) {
            const historyStartTime = Date.now();
            try {
                previousMessages = await this.persistenceService.loadPreviousMessages(
                    sessionId,
                    userId,
                    this.config.messageHistoryLimit
                );

                if (previousMessages && previousMessages.length > 0) {
                    edgeLogger.info('Loaded previous messages for context', {
                        category: LOG_CATEGORIES.CHAT, // Or SYSTEM?
                        operation: operationName,
                        sessionId,
                        messageCount: previousMessages.length,
                        durationMs: Date.now() - historyStartTime
                    });
                }
            } catch (error) {
                edgeLogger.error('Failed to load previous messages for context', {
                    category: LOG_CATEGORIES.SYSTEM, // Error loading is more system level
                    operation: operationName,
                    sessionId,
                    error: error instanceof Error ? error.message : String(error),
                    durationMs: Date.now() - historyStartTime,
                    important: true // Failure to load history could impact response quality
                });
                // Do not throw, continue context creation without history
            }
        } else {
            edgeLogger.debug('Skipping history loading for context', {
                category: LOG_CATEGORIES.CHAT,
                operation: operationName,
                sessionId,
                reason: !userId ? 'no_userid' : !sessionId ? 'no_sessionid' : 'persistence_disabled'
            });
        }

        // Construct the final context object
        const context: ChatEngineContext = {
            requestId,
            sessionId,
            userId,
            startTime,
            messages: validatedMessages, // Current messages from the request
            previousMessages, // History messages loaded (or undefined)
            urls,
            metrics: {}, // Initialize metrics, to be populated later
            sessionMetadata: {} // Initialize metadata, to be populated later
        };

        edgeLogger.info('Chat context built successfully', {
            category: LOG_CATEGORIES.CHAT,
            operation: operationName,
            sessionId,
            requestId,
            historyLoaded: previousMessages ? previousMessages.length : 0,
            urlsFound: urls.length,
            durationMs: Date.now() - startTime
        });

        return context;
    }
}

// Helper function (consider moving to misc-utils if used elsewhere)
function maskUserId(userId: string): string {
    return userId ? userId.substring(0, 5) + '...' + userId.substring(userId.length - 4) : 'anonymous';
} 