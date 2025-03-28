import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';
import type { AgentType } from '@/lib/agents/prompts';

interface ChatRequest {
  messages: Message[];
  id?: string;
  useDeepSearch?: boolean;
  deepSearchEnabled?: boolean;
  agentId?: AgentType;
}

/**
 * Helper to safely convert various representations of boolean values
 * Handles true/false, "true"/"false", 1/0, "1"/"0" and similar variations
 */
function parseBooleanValue(value: any): boolean {
  // Handle direct boolean values
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle string representations ("true", "false", "1", "0")
  if (typeof value === 'string') {
    const lowercaseValue = value.toLowerCase().trim();
    return lowercaseValue === 'true' || lowercaseValue === '1' || lowercaseValue === 'yes';
  }

  // Handle numeric values (1, 0)
  if (typeof value === 'number') {
    return value === 1;
  }

  // Default to false for null, undefined, or any other type
  return false;
}

export function validateChatRequest(body: any): ChatRequest {
  // Log full request structure for debugging
  edgeLogger.debug('Validating chat request', {
    category: 'tools',
    operation: 'validate_chat_request',
    deepSearchEnabled: !!body.deepSearchEnabled,
    rawDeepSearchEnabled: body.deepSearchEnabled,
    deepSearchEnabledType: typeof body.deepSearchEnabled,
    deepSearchEnabledValue: String(body.deepSearchEnabled),
    hasId: !!body.id,
    bodyHasDeepSearchKey: 'deepSearchEnabled' in body,
    hasMessage: !!body.message,
    hasMessages: !!body.messages
  });

  // Handle both traditional format (messages array) and optimized format (single message)
  let messages: Message[] = [];

  // Case 1: Traditional format with messages array
  if (body.messages && Array.isArray(body.messages)) {
    messages = body.messages;
  }
  // Case 2: Optimized format with single message object
  else if (body.message && typeof body.message === 'object') {
    edgeLogger.info('Using optimized single message format', {
      category: 'chat',
      messageId: body.message.id
    });
    messages = [body.message];
  }
  // Error case: Neither format is valid
  else {
    edgeLogger.error('Invalid chat request: neither messages array nor message object found', {
      category: 'chat',
      body: JSON.stringify(body).substring(0, 200) + '...',
      bodyKeys: Object.keys(body),
      important: true
    });
    throw new Error('Either messages array or message object is required');
  }

  // Validate each message
  for (const message of messages) {
    if (!message.role || !message.content) {
      edgeLogger.error('Invalid chat request: message is missing role or content', {
        category: 'chat',
        message: JSON.stringify(message).substring(0, 200) + '...',
        important: true
      });
      throw new Error('Each message must have a role and content');
    }
  }

  // Parse the deepSearchEnabled flag to handle both boolean and string representations
  const deepSearchEnabled = parseBooleanValue(body.deepSearchEnabled);

  const validatedRequest = {
    messages,
    id: body.id,
    useDeepSearch: body.useDeepSearch || false,
    deepSearchEnabled,
    agentId: body.agentId || 'default'
  };

  // Log the final validated request
  edgeLogger.debug('Chat request validated', {
    category: 'tools',
    operation: 'chat_request_validated',
    originalDeepSearchEnabled: body.deepSearchEnabled,
    originalDeepSearchEnabledType: typeof body.deepSearchEnabled,
    validatedDeepSearchEnabled: validatedRequest.deepSearchEnabled,
    validatedAgentId: validatedRequest.agentId,
    messageCount: messages.length
  });

  return validatedRequest;
} 