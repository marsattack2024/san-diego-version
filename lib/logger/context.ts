import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  sessionId?: string;
  path?: string;
  startTime?: number;
  metadata?: Record<string, any>;
}

export const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export function getContext(): LogContext {
  return asyncLocalStorage.getStore() || {};
}

export function withContext<T>(context: LogContext, fn: () => Promise<T>): Promise<T> {
  return asyncLocalStorage.run({ ...getContext(), ...context }, fn);
}

// Helper to create a context with timing
export function createTimedContext(context: Omit<LogContext, 'startTime'>): LogContext {
  return {
    ...context,
    startTime: performance.now()
  };
}

// Helper to get elapsed time from context
export function getElapsedTime(): number | undefined {
  const context = getContext();
  return context.startTime ? Math.round(performance.now() - context.startTime) : undefined;
} 