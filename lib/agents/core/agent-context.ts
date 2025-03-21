import { v4 as uuidv4 } from 'uuid';
import { AgentContext, AgentMessage } from './agent-types';
import { clientLogger } from '../../logger/client-logger';

// Create a logger function for agent context
const logger = {
  debug: (message: string, data?: any) => clientLogger.debug(`agent:context - ${message}`, data),
  info: (message: string, data?: any) => clientLogger.info(`agent:context - ${message}`, data),
  warn: (message: string, data?: any) => clientLogger.warn(`agent:context - ${message}`, data),
  error: (message: string | Error, data?: any) => clientLogger.error(`agent:context - ${message instanceof Error ? message.message : message}`, {
    ...(data || {}),
    stack: message instanceof Error ? message.stack : undefined
  })
};

/**
 * Create a new agent context
 */
export function createAgentContext(
  initialMessages: AgentMessage[] = [],
  metadata: Record<string, any> = {}
): AgentContext {
  const sessionId = uuidv4();
  const conversationId = uuidv4();
  
  logger.debug('Creating new agent context', {
    sessionId,
    conversationId
  });
  
  return {
    sessionId,
    conversationId,
    history: initialMessages,
    metadata: {
      createdAt: new Date().toISOString(),
      ...metadata
    }
  };
}