import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  sessionId?: string;
  path?: string;
  startTime?: number;
  metadata?: Record<string, any>;
  requestStartTime?: number;
  requestEndTime?: number;
  totalRequestDuration?: number;
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

// Helper to start request timing tracking
export function startRequest(context: Omit<LogContext, 'requestStartTime'>): LogContext {
  const newContext = {
    ...context,
    requestStartTime: Date.now(),
    requestId: context.requestId || crypto.randomUUID().substring(0, 8)
  };
  return newContext;
}

// Helper to end request timing tracking
export function endRequest(additionalContext: Partial<LogContext> = {}): LogContext {
  const context = getContext();
  const now = Date.now();
  const totalRequestDuration = context.requestStartTime 
    ? now - context.requestStartTime 
    : undefined;
    
  return {
    ...context,
    ...additionalContext,
    requestEndTime: now,
    totalRequestDuration
  };
}