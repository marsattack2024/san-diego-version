import { clientLogger } from '../../logger/client-logger';
import { AgentType } from './agent-types';

/**
 * Creates a logger for a specific agent
 */
export function createAgentLogger(agentId: AgentType, {
  userId,
  sessionId,
  conversationId
}: {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
}) {
  // Create a prefix for all log messages
  const prefix = `agent:${agentId}`;
  
  // Add context to the logger if provided
  const context = {
    agentId,
    ...(userId && { userId }),
    ...(sessionId && { sessionId }),
    ...(conversationId && { conversationId })
  };
  
  return {
    debug: (message: string, data?: any) => clientLogger.debug(`${prefix} - ${message}`, { ...context, ...data }),
    info: (message: string, data?: any) => clientLogger.info(`${prefix} - ${message}`, { ...context, ...data }),
    warn: (message: string, data?: any) => clientLogger.warn(`${prefix} - ${message}`, { ...context, ...data }),
    error: (message: string | Error, data?: any) => clientLogger.error(
      message instanceof Error ? `${prefix} - ${message.message}` : `${prefix} - ${message}`,
      { ...context, ...data, stack: message instanceof Error ? message.stack : undefined }
    )
  };
}

/**
 * Creates a logger for the agent router
 */
export function createRouterLogger() {
  const prefix = 'agent:router';
  
  return {
    debug: (message: string, data?: any) => clientLogger.debug(`${prefix} - ${message}`, data),
    info: (message: string, data?: any) => clientLogger.info(`${prefix} - ${message}`, data),
    warn: (message: string, data?: any) => clientLogger.warn(`${prefix} - ${message}`, data),
    error: (message: string | Error, data?: any) => clientLogger.error(
      message instanceof Error ? `${prefix} - ${message.message}` : `${prefix} - ${message}`,
      { ...data, stack: message instanceof Error ? message.stack : undefined }
    )
  };
} 