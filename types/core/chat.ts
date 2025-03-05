import { Message } from 'ai';

// Basic chat types
export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  icon?: string;
}

export interface DeepSearchOptions {
  enabled: boolean;
  query?: string;
  sources?: string[];
}

// Enhanced message types
export type MessageStatus = 'pending' | 'sending' | 'complete' | 'error';
export type MessageSource = 'local' | 'store' | 'api' | 'reconciled';

export interface EnhancedMessage extends Message {
  // Core message data
  id: string;
  
  // Enhanced properties
  localId?: string;
  status: MessageStatus;
  serverConfirmed: boolean;
  timestamp: number;
  
  // Tracking and debugging
  source: MessageSource;
  renderKey?: string;
  reconciled?: boolean;
  version?: number;
}

/**
 * Creates an enhanced message from a basic message
 */
export function createEnhancedMessage(
  message: Message, 
  status: MessageStatus = 'complete', 
  serverConfirmed: boolean = true,
  source: MessageSource = 'local'
): EnhancedMessage {
  return {
    ...message,
    localId: message.id, // Preserve original ID
    status,
    serverConfirmed,
    timestamp: Date.now(),
    source,
    version: 1
  };
}

/**
 * Updates an enhanced message with new properties
 */
export function updateEnhancedMessage(
  message: EnhancedMessage, 
  updates: Partial<EnhancedMessage>
): EnhancedMessage {
  return {
    ...message,
    ...updates,
    version: (message.version || 1) + 1 // Increment version
  };
}