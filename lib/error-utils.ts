import { logger } from '@/lib/logger';

export type ErrorWithStatus = Error & { status?: number };

export type ErrorState = {
  type: 'network' | 'rate_limit' | 'server' | 'auth' | 'validation' | 'unknown';
  message: string;
  retryable: boolean;
  originalError?: any;
};

export function categorizeError(error: any): ErrorState {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Network connection issue. Please check your internet connection.',
      retryable: true,
      originalError: error
    };
  }
  
  // Rate limiting errors
  if (error.status === 429 || (error.message && error.message.includes('rate limit'))) {
    return {
      type: 'rate_limit',
      message: 'Too many requests. Please try again in a moment.',
      retryable: true,
      originalError: error
    };
  }
  
  // Authentication errors
  if (error.status === 401 || error.status === 403) {
    return {
      type: 'auth',
      message: 'Authentication error. Please sign in again.',
      retryable: false,
      originalError: error
    };
  }
  
  // Validation errors
  if (error.status === 400 || error.status === 422) {
    return {
      type: 'validation',
      message: error.message || 'Invalid request. Please check your input.',
      retryable: true,
      originalError: error
    };
  }
  
  // Server errors
  if (error.status && error.status >= 500) {
    return {
      type: 'server',
      message: 'Server error. Our team has been notified.',
      retryable: true,
      originalError: error
    };
  }
  
  // Default/unknown errors
  return {
    type: 'unknown',
    message: error.message || 'Something went wrong. Please try again.',
    retryable: true,
    originalError: error
  };
}

export function logError(error: any, context: Record<string, any> = {}) {
  const errorState = categorizeError(error);
  
  const logData = {
    errorType: errorState.type,
    originalError: error,
    ...context
  };
  
  switch (errorState.type) {
    case 'network':
      logger.warn(logData, 'Network error occurred');
      break;
    case 'rate_limit':
      logger.warn(logData, 'Rate limit exceeded');
      break;
    case 'auth':
      logger.warn(logData, 'Authentication error');
      break;
    case 'validation':
      logger.info(logData, 'Validation error');
      break;
    case 'server':
      logger.error(logData, 'Server error');
      break;
    default:
      logger.error(logData, 'Unknown error occurred');
  }
  
  // In production, you would send to a monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry.captureException(error, { extra: context });
  }
  
  return errorState;
}

// Exponential backoff for retries
export function getRetryDelay(attempt: number, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
} 