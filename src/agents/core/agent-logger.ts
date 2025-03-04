import { createLogger } from '../../utils/client-logger';
import { AgentType } from './agent-types';

/**
 * Create a logger for an agent with the appropriate context
 */
export function createAgentLogger(agentId: AgentType, context?: { 
  sessionId?: string;
  conversationId?: string;
}) {
  const logger = createLogger(`agent:${agentId}`);
  
  // Add context to the logger if provided
  if (context) {
    const contextualLogger = logger.child({
      sessionId: context.sessionId,
      conversationId: context.conversationId
    });
    
    return contextualLogger;
  }
  
  return logger;
}

/**
 * Create a logger for the agent router
 */
export function createRouterLogger() {
  return createLogger('agent:router');
} 