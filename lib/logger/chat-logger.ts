/**
 * Specialized chat logger for tracking end-to-end chat request timing
 * 
 * This module provides specialized logging functions for chat operations,
 * with a focus on end-to-end request timing and performance monitoring.
 */

import { edgeLogger } from './edge-logger';
import { LOG_CATEGORIES } from './constants';
import { getContext, startRequest, endRequest } from './context';
import { THRESHOLDS } from './edge-logger';

// Mask user ID for logging - follow the pattern in other loggers for consistency
const maskUserId = (userId: string): string => {
  if (!userId) return 'unknown';
  return userId.substring(0, 4) + '...' + userId.substring(userId.length - 4);
};

export const chatLogger = {
  /**
   * Log chat request received - start of end-to-end request timing
   */
  requestReceived: (params: {
    sessionId: string;
    userId?: string;
    messageId: string;
    agentType?: string;
    deepSearchEnabled?: boolean;
  }) => {
    const { sessionId, userId, messageId, agentType, deepSearchEnabled } = params;
    const context = startRequest({
      sessionId,
      userId,
      operation: 'chat_request',
      requestId: crypto.randomUUID().substring(0, 8),
      metadata: {
        messageId,
        agentType,
        deepSearchEnabled
      }
    });
    
    edgeLogger.info('Chat request started', {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_request_start',
      sessionId,
      userId: userId ? maskUserId(userId) : undefined,
      messageId,
      agentType: agentType || 'default',
      deepSearchEnabled: !!deepSearchEnabled,
      requestId: context.requestId
    });
    
    return context;
  },
  
  /**
   * Log chat request completed - end of end-to-end request timing
   * Logs the entire lifecycle duration from initial request to final response
   */
  requestCompleted: (params: {
    responseLength: number;
    hasToolsUsed: boolean;
    toolsCount: number;
    toolNames?: string[];
    additionalData?: Record<string, any>;
  }) => {
    const { responseLength, hasToolsUsed, toolsCount, toolNames, additionalData } = params;
    const context = endRequest();
    const totalDuration = context.totalRequestDuration || 0;
    
    const logMessage = {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_request_complete',
      sessionId: context.sessionId,
      userId: context.userId ? maskUserId(context.userId) : undefined,
      totalDurationMs: totalDuration,
      responseLength,
      hasToolsUsed,
      toolsCount,
      toolNames: toolNames || [],
      requestId: context.requestId,
      slow: totalDuration > THRESHOLDS.SLOW_OPERATION,
      important: totalDuration > THRESHOLDS.IMPORTANT_THRESHOLD,
      ...additionalData
    };
    
    if (totalDuration > THRESHOLDS.SLOW_OPERATION) {
      edgeLogger.warn('Chat request completed (slow)', logMessage);
    } else {
      edgeLogger.info('Chat request completed', logMessage);
    }
    
    return context;
  },
  
  /**
   * Log individual operation within chat processing
   * For tracking intermediate steps with their own timing
   */
  operation: (operation: string, durationMs: number, data: Record<string, any> = {}) => {
    const context = getContext();
    edgeLogger.info(`Chat operation: ${operation}`, {
      category: LOG_CATEGORIES.CHAT,
      operation,
      durationMs,
      requestId: context.requestId,
      slow: durationMs > THRESHOLDS.SLOW_OPERATION,
      important: durationMs > THRESHOLDS.IMPORTANT_THRESHOLD,
      ...data
    });
  },
  
  /**
   * Log error in chat processing
   * Includes end-to-end timing up to the error point
   */
  error: (message: string, error: Error | string, data: Record<string, any> = {}) => {
    const context = endRequest();
    const totalDuration = context.totalRequestDuration || 0;
    
    edgeLogger.error(message, {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_request_error',
      error,
      requestId: context.requestId,
      sessionId: context.sessionId,
      userId: context.userId ? maskUserId(context.userId) : undefined,
      totalDurationMs: totalDuration,
      important: true,
      ...data
    });
  }
};

export default chatLogger;