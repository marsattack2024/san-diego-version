import { Message } from 'ai';

/**
 * Options for message identity generation
 */
export interface MessageIdentityOptions {
  conversationId?: string;
  role?: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  existingId?: string;
  content?: string;
}