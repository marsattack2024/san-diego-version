import { logger as baseLogger } from './base-logger';

interface AIInteractionParams {
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens?: number;
  responseTimeMs: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Specialized logger for AI operations
 * Provides monitoring for AI model interactions and performance
 */
export const logger = {
  // Log model inference start
  logInferenceStart: (modelId: string, params: Record<string, any> = {}) => {
    baseLogger.info('AI inference started', {
      operation: 'model_inference',
      modelId,
      ...params,
      important: true
    });
  },

  // Log model inference completion
  logInferenceComplete: (modelId: string, durationMs: number, params: Record<string, any> = {}) => {
    const isSlowInference = durationMs > 2000;
    
    baseLogger.info(`AI inference completed in ${durationMs}ms`, {
      operation: 'model_inference',
      modelId,
      durationMs,
      ...params,
      important: isSlowInference
    });

    if (isSlowInference) {
      baseLogger.warn(`Slow model inference (${durationMs}ms)`, {
        operation: 'model_inference',
        modelId,
        durationMs,
        ...params
      });
    }
  },

  // Log model errors
  logModelError: (modelId: string, error: any, context: Record<string, any> = {}) => {
    baseLogger.error(`AI model error`, {
      operation: 'model_inference',
      modelId,
      error,
      ...context,
      important: true
    });
  }
};

/**
 * Logs AI service interactions with performance metrics
 * Used for tracking token usage, response times, and errors
 */
export function logAIInteraction({
  requestId,
  model,
  promptTokens,
  completionTokens,
  responseTimeMs,
  success,
  errorMessage,
  metadata = {}
}: AIInteractionParams): void {
  // Always log errors and slow responses
  const isSlowResponse = responseTimeMs > 2000;
  const shouldLog = success ? 
    (isSlowResponse || process.env.NODE_ENV === 'development') : 
    true;
  
  if (shouldLog) {
    if (success) {
      logger.logInferenceComplete(model, responseTimeMs, {
        requestId,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + (completionTokens || 0),
        ...metadata,
        important: isSlowResponse
      });
      
      if (isSlowResponse) {
        logger.logInferenceComplete(model, responseTimeMs, {
          requestId,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + (completionTokens || 0),
          ...metadata
        });
      }
    } else {
      logger.logModelError(model, errorMessage, {
        requestId,
        promptTokens,
        responseTimeMs,
        ...metadata,
        important: true
      });
    }
  }
}

/**
 * Wraps an AI service call with timing and logging
 * @param fn The async function that makes the AI call
 * @param options Parameters for logging
 * @returns The result of the AI call
 */
export async function tracedAIOperation<T>(
  fn: () => Promise<T>,
  options: {
    requestId: string;
    model: string;
    promptTokens: number;
    metadata?: Record<string, any>;
  }
): Promise<T> {
  const startTime = performance.now();
  
  try {
    // Execute the AI operation
    const result = await fn();
    
    // Log successful completion
    let completionTokens: number | undefined;
    
    // Try to extract completion tokens if result has that property
    if (result && typeof result === 'object' && 'usage' in result) {
      const usage = (result as any).usage;
      if (usage && typeof usage === 'object' && 'completion_tokens' in usage) {
        completionTokens = usage.completion_tokens;
      }
    }
    
    logAIInteraction({
      ...options,
      completionTokens,
      responseTimeMs: Math.round(performance.now() - startTime),
      success: true
    });
    
    return result;
  } catch (error) {
    // Log error
    logAIInteraction({
      ...options,
      responseTimeMs: Math.round(performance.now() - startTime),
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
} 