import { Message } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

/**
 * Validates a message object to ensure it has all required fields
 */
function validateMessage(message: Message): boolean {
  if (!message.content || typeof message.content !== 'string') {
    logger.warn('[validateMessage] Invalid message content', { message });
    return false;
  }
  
  if (!message.role || !['user', 'assistant', 'system', 'function', 'data', 'tool'].includes(message.role)) {
    logger.warn('[validateMessage] Invalid message role', { role: message.role });
    return false;
  }
  
  return true;
}

/**
 * Ensures all messages have unique IDs and are valid
 * This is important for React rendering and preventing duplicate key errors
 */
export function ensureMessageIds(messages: Message[]): Message[] {
  // Track used IDs to prevent duplicates
  const usedIds = new Set<string>();
  const validatedMessages: Message[] = [];
  
  logger.debug(`[ensureMessageIds] Processing ${messages.length} messages`);
  
  for (const message of messages) {
    // Skip invalid messages
    if (!validateMessage(message)) {
      logger.warn('[ensureMessageIds] Skipping invalid message', { message });
      continue;
    }
    
    let finalMessage = { ...message };
    
    // If message already has an ID
    if (message.id) {
      // Check if this ID has been used before
      if (usedIds.has(message.id)) {
        // Generate a new ID if duplicate
        const newId = `${message.id}-${uuidv4().substring(0, 8)}`;
        logger.debug(`[ensureMessageIds] Found duplicate ID: ${message.id}, generating new ID: ${newId}`);
        finalMessage = { ...message, id: newId };
      }
    } else {
      // Generate a new ID for messages without one
      const newId = uuidv4();
      logger.debug(`[ensureMessageIds] Generated new ID for message: ${newId}`);
      finalMessage = { ...message, id: newId };
    }
    
    // Record this ID as used
    usedIds.add(finalMessage.id);
    validatedMessages.push(finalMessage);
  }
  
  // Log any discrepancies
  if (validatedMessages.length !== messages.length) {
    logger.warn(`[ensureMessageIds] Some messages were filtered out`, {
      original: messages.length,
      validated: validatedMessages.length
    });
  }
  
  return validatedMessages;
}

/**
 * Verifies message order and consistency
 * Returns true if the message sequence is valid
 */
export function verifyMessageSequence(messages: Message[]): boolean {
  let lastUserMessage = -1;
  let lastAssistantMessage = -1;
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    if (message.role === 'user') {
      // Check if there's an unanswered user message
      if (lastUserMessage > lastAssistantMessage && lastUserMessage !== -1) {
        logger.warn('[verifyMessageSequence] Multiple consecutive user messages found', {
          index: i,
          lastUserMessage,
          lastAssistantMessage
        });
        return false;
      }
      lastUserMessage = i;
    } else if (message.role === 'assistant') {
      // Check if there's an assistant message without a preceding user message
      if (lastUserMessage === -1 && i !== 0) {
        logger.warn('[verifyMessageSequence] Assistant message without preceding user message', {
          index: i
        });
        return false;
      }
      lastAssistantMessage = i;
    }
  }
  
  return true;
}

/**
 * Batches messages for efficient rendering with validation
 */
export function batchMessages(messages: Message[], batchSize = 10): Message[][] {
  // Validate messages first
  const validMessages = messages.filter(validateMessage);
  
  if (validMessages.length !== messages.length) {
    logger.warn('[batchMessages] Some messages were filtered out', {
      original: messages.length,
      valid: validMessages.length
    });
  }
  
  if (validMessages.length <= batchSize) {
    return [validMessages];
  }
  
  const batches: Message[][] = [];
  for (let i = 0; i < validMessages.length; i += batchSize) {
    batches.push(validMessages.slice(i, i + batchSize));
  }
  
  logger.debug(`[batchMessages] Created ${batches.length} batches from ${validMessages.length} messages`);
  return batches;
}

/**
 * Calculates the token count estimate for a message
 */
export function estimateTokenCount(message: Message): number {
  if (!validateMessage(message)) {
    logger.warn('[estimateTokenCount] Invalid message', { message });
    return 0;
  }
  
  // Rough estimate: 1 token ≈ 4 characters for English text
  const characterCount = message.content.length;
  return Math.ceil(characterCount / 4);
}

/**
 * Estimates total token count for a conversation
 */
export function estimateConversationTokens(messages: Message[]): number {
  return messages.reduce((total, message) => {
    return total + estimateTokenCount(message);
  }, 0);
}

/**
 * Trims a conversation to fit within token limits while maintaining context
 */
export function trimConversationToFitTokenLimit(messages: Message[], maxTokens: number = 4000): Message[] {
  // Validate messages first
  const validMessages = messages.filter(validateMessage);
  
  if (validMessages.length <= 10) return validMessages;
  
  // Keep system messages and the most recent messages
  const systemMessages = validMessages.filter(m => m.role === 'system');
  const nonSystemMessages = validMessages.filter(m => m.role !== 'system');
  
  // Ensure we keep complete conversation pairs
  const recentMessages: Message[] = [];
  let tokenCount = systemMessages.reduce((sum, msg) => sum + estimateTokenCount(msg), 0);
  
  // Process messages from newest to oldest
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const message = nonSystemMessages[i];
    const nextTokenCount = tokenCount + estimateTokenCount(message);
    
    if (nextTokenCount > maxTokens) {
      break;
    }
    
    recentMessages.unshift(message);
    tokenCount = nextTokenCount;
  }
  
  const finalMessages = [...systemMessages, ...recentMessages];
  
  logger.debug('[trimConversation]', {
    originalLength: messages.length,
    finalLength: finalMessages.length,
    systemMessages: systemMessages.length,
    estimatedTokens: tokenCount
  });
  
  return finalMessages;
} 