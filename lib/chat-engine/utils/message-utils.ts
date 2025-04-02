import { Message } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Add interface for the parts array items
interface MessagePart {
    type: string;
    text?: string;
    [key: string]: any;
}

/**
 * Standardizes a message object to conform to the Vercel AI SDK Message format.
 * Ensures content is always a string, while preserving the original parts array if it exists.
 * 
 * @param message The message object to standardize
 * @param options Additional options for standardization
 * @returns A standardized Message object or null if invalid
 */
export function standardizeMessage(
    message: any,
    options: {
        operationId?: string,
        validateRole?: boolean,
        defaultRole?: 'user' | 'assistant' | 'system' | 'tool' | 'function',
        preserveId?: boolean
    } = {}
): Message | null {
    const {
        operationId = `std_msg_${Date.now().toString(36)}`,
        validateRole = true,
        defaultRole = 'user',
        preserveId = true
    } = options;

    // Validate message is an object
    if (!message || typeof message !== 'object') {
        edgeLogger.warn('Invalid message format: not an object', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'standardize_message',
            operationId
        });
        return null;
    }

    // Determine valid role
    const validRoles = ['user', 'assistant', 'system', 'tool', 'function'];
    let role = message.role;

    if (validateRole && (!role || !validRoles.includes(role))) {
        edgeLogger.warn('Invalid message role', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'standardize_message',
            operationId,
            providedRole: role
        });
        role = defaultRole;
    }

    // Determine valid id
    const id = preserveId && message.id ? message.id : crypto.randomUUID();

    // Extract content
    let content = '';
    const originalParts = (message.parts && Array.isArray(message.parts))
        ? message.parts
        : undefined;

    // Priority 1: Use existing string content if available and not empty
    if (typeof message.content === 'string' && message.content.trim() !== '') {
        content = message.content;
    }
    // Priority 2: Try to extract content from parts array
    else if (originalParts) {
        const textPart = originalParts.find((part: MessagePart) =>
            part && part.type === 'text' && typeof part.text === 'string'
        );

        if (textPart) {
            content = textPart.text as string;
            edgeLogger.debug('Extracted content from parts array', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'standardize_message',
                operationId,
                contentLength: content.length
            });
        } else {
            edgeLogger.warn('No text part found in parts array', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'standardize_message',
                operationId,
            });
        }
    }
    // Priority 3: If content is an object (e.g., tool result), stringify it
    else if (message.content && typeof message.content === 'object') {
        try {
            content = JSON.stringify(message.content);
            edgeLogger.debug('Stringified object content', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'standardize_message',
                operationId,
                contentLength: content.length
            });
        } catch (error) {
            edgeLogger.error('Failed to stringify content object', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'standardize_message',
                operationId,
                error: error instanceof Error ? error.message : String(error)
            });
            content = '';
        }
    }

    // Create the standardized message, preserving parts if they exist
    const standardizedMessage: Message = {
        id,
        role: role as Message['role'],
        content,
        createdAt: message.createdAt || new Date(),
        // Preserve all other original properties like name, function_call, etc.
        ...(message.name && { name: message.name }),
        ...(message.reasoning && { reasoning: message.reasoning }),
        ...(originalParts && { parts: originalParts }) // Include parts if they existed
    };

    return standardizedMessage;
}

/**
 * Standardizes an array of messages to conform to the Vercel AI SDK Message format.
 * 
 * @param messages Array of message objects to standardize
 * @param options Additional options for standardization
 * @returns Array of standardized Message objects
 */
export function standardizeMessages(
    messages: any[] | any,
    options: {
        operationId?: string,
        validateRole?: boolean,
        defaultRole?: 'user' | 'assistant' | 'system' | 'tool' | 'function',
        preserveId?: boolean
    } = {}
): Message[] {
    const operationId = options.operationId || `std_msgs_${Date.now().toString(36)}`;

    // Handle single message object
    if (messages && !Array.isArray(messages)) {
        const standardized = standardizeMessage(messages, { ...options, operationId });
        return standardized ? [standardized] : [];
    }

    // Handle message array
    if (!Array.isArray(messages)) {
        edgeLogger.warn('Invalid messages format: not an array', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'standardize_messages',
            operationId
        });
        return [];
    }

    const standardizedMessages: Message[] = [];

    for (const message of messages) {
        const standardized = standardizeMessage(message, { ...options, operationId });
        if (standardized) {
            standardizedMessages.push(standardized);
        }
    }

    edgeLogger.debug('Standardized messages', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'standardize_messages',
        operationId,
        originalCount: messages.length,
        standardizedCount: standardizedMessages.length
    });

    return standardizedMessages;
}

/**
 * Checks if a message conforms to the Vercel AI SDK Message format.
 * 
 * @param message The message object to validate
 * @returns Boolean indicating if the message is valid
 */
export function isValidMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;

    const validRoles = ['user', 'assistant', 'system', 'tool', 'function'];
    if (!validRoles.includes(message.role)) return false;

    // For valid messages, either content or parts must be present
    const hasContent = 'content' in message;
    const hasParts = message.parts && Array.isArray(message.parts) && message.parts.length > 0;

    return hasContent || hasParts;
}

/**
 * Extracts content from an AI SDK message
 * Handles both simple content string and parts array formats
 * 
 * @param message The message to extract content from
 * @returns The extracted content as a string
 */
export function extractMessageContent(message: any): string {
    if (!message) return '';

    // Case 1: Direct string content if not empty
    if (typeof message.content === 'string' && message.content.trim() !== '') {
        return message.content;
    }

    // Case 2: Extract from parts (prioritize this when content is empty)
    if (message.parts && Array.isArray(message.parts)) {
        const textPart = message.parts.find((part: MessagePart) =>
            part && part.type === 'text' && typeof part.text === 'string'
        );

        if (textPart && textPart.text) {
            return textPart.text as string;
        }
    }

    // Case 3: Use empty content string if available
    if (typeof message.content === 'string') {
        return message.content;
    }

    // Case 4: Object content
    if (message.content && typeof message.content === 'object') {
        try {
            return JSON.stringify(message.content);
        } catch (error) {
            // Silent fail
        }
    }

    return '';
} 