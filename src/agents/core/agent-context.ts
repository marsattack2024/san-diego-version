import { v4 as uuidv4 } from 'uuid';
import { AgentContext, AgentMessage, createAgentMessage } from './agent-types';
import { createLogger } from '../../utils/client-logger';

const logger = createLogger('agent:context');

/**
 * Create a new agent context
 */
export function createAgentContext(
  initialMessages: AgentMessage[] = [],
  metadata: Record<string, any> = {}
): AgentContext {
  const sessionId = uuidv4();
  const conversationId = uuidv4();
  
  logger.debug({
    sessionId,
    conversationId
  }, 'Creating new agent context');
  
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

/**
 * Add a system message to the context
 */
export function addSystemMessage(
  context: AgentContext,
  content: string,
  metadata?: Record<string, any>
): AgentContext {
  const message = createAgentMessage('system', content, metadata);
  
  logger.debug({
    sessionId: context.sessionId,
    conversationId: context.conversationId,
    messageId: message.id
  }, 'Adding system message to context');
  
  return {
    ...context,
    history: [...context.history, message]
  };
}

/**
 * Clear the conversation history in the context
 */
export function clearConversationHistory(context: AgentContext): AgentContext {
  logger.debug({
    sessionId: context.sessionId,
    conversationId: context.conversationId
  }, 'Clearing conversation history');
  
  // Generate a new conversation ID
  const newConversationId = uuidv4();
  
  return {
    ...context,
    conversationId: newConversationId,
    history: [],
    metadata: {
      ...context.metadata,
      previousConversationId: context.conversationId,
      clearedAt: new Date().toISOString()
    }
  };
}

/**
 * Save the context to localStorage (client-side only)
 */
export function saveContextToStorage(context: AgentContext): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(
      `agent-context-${context.sessionId}`,
      JSON.stringify(context)
    );
    
    logger.debug({
      sessionId: context.sessionId,
      conversationId: context.conversationId
    }, 'Saved agent context to localStorage');
  } catch (error) {
    logger.error({
      error,
      sessionId: context.sessionId
    }, 'Error saving agent context to localStorage');
  }
}

/**
 * Load context from localStorage (client-side only)
 */
export function loadContextFromStorage(sessionId: string): AgentContext | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const storedContext = localStorage.getItem(`agent-context-${sessionId}`);
    if (!storedContext) return null;
    
    const context = JSON.parse(storedContext) as AgentContext;
    
    // Convert string dates back to Date objects
    context.history = context.history.map(msg => ({
      ...msg,
      createdAt: new Date(msg.createdAt)
    }));
    
    logger.debug({
      sessionId,
      conversationId: context.conversationId
    }, 'Loaded agent context from localStorage');
    
    return context;
  } catch (error) {
    logger.error({
      error,
      sessionId
    }, 'Error loading agent context from localStorage');
    return null;
  }
} 