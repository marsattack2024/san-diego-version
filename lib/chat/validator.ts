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

export function validateChatRequest(body: any): ChatRequest {
  // Check if messages array exists
  if (!body.messages || !Array.isArray(body.messages)) {
    edgeLogger.error('Invalid chat request: messages array is missing or not an array', { body });
    throw new Error('Messages array is required and must be an array');
  }

  // Validate each message
  for (const message of body.messages) {
    if (!message.role || !message.content) {
      edgeLogger.error('Invalid chat request: message is missing role or content', { message });
      throw new Error('Each message must have a role and content');
    }
  }

  return {
    messages: body.messages,
    id: body.id,
    useDeepSearch: body.useDeepSearch || false,
    deepSearchEnabled: body.deepSearchEnabled || false,
    agentId: body.agentId || 'default'
  };
} 