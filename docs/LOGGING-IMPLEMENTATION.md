# Logging Implementation in AI Chat Interface

This document outlines the logging implementation in the AI Chat Interface application, following best practices for Next.js TypeScript applications.

## Overview

Our logging system follows best practices for Next.js TypeScript applications, providing comprehensive visibility into application behavior while maintaining performance. Key features include:

- **Structured JSON Logging**: All logs are formatted as JSON for easy parsing and analysis
- **Context-Aware Loggers**: Loggers maintain context across the request lifecycle
- **Performance Metrics**: Automatic tracking of response times and operation durations
- **Error Tracking**: Detailed error information with stack traces
- **Environment-Aware Configuration**: Different log levels for development and production
- **Remote Logging**: Support for sending client-side logs to the server
- **Batch Processing**: Client logs are batched to reduce network requests
- **Sampling**: High-volume logs are sampled in production to reduce overhead
- **Business Event Logging**: Dedicated API for logging business-relevant events

## Server-Side Logging

### Core Implementation

We use Pino for server-side logging, configured in `src/utils/server-logger.ts`:

```typescript
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

// Environment-aware configuration
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  timestamp: true,
  // Only pretty-print in development
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  })
});
```

### Request Logging

We've implemented middleware in `middleware.ts` to log all incoming requests:

```typescript
export function middleware(request: NextRequest) {
  const startTime = performance.now();
  const requestId = request.headers.get('x-request-id') || uuidv4();
  
  // Create request-specific logger
  const log = logger.child({ 
    requestId, 
    clientIp,
    userAgent,
    url,
    method
  });
  
  log.info('Request received');
  
  // Add requestId to headers for downstream usage
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  
  // Create the response
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  // Add timing header to the response
  response.headers.set('Server-Timing', `request;dur=${Math.round(performance.now() - startTime)}`);
  
  return response;
}
```

### API Route Logging

API routes like `app/api/chat/route.ts` and `app/api/client-logs/route.ts` use the server logger to log requests, responses, and errors:

```typescript
export async function POST(req: Request) {
  const requestId = uuidv4();
  const startTime = performance.now();
  const clientIp = getClientIp(req);
  
  // Create request-specific logger
  const log = logger.child({ 
    requestId, 
    clientIp,
    userAgent,
    endpoint: '/api/chat'
  });
  
  log.info({ method: 'POST' }, 'Chat request received');
  
  try {
    // Process request...
    
    log.info({ 
      responseTime,
      estimatedTokens,
      agent: selectedAgentDetails?.id || 'default'
    }, 'Chat request completed successfully');
    
    return result;
  } catch (error) {
    log.error({ 
      err: error,
      errorMessage,
      errorStack, 
      responseTime,
      clientIp
    }, 'Unexpected error processing chat request');
    
    return errorResponse;
  }
}
```

## Client-Side Logging

### Core Implementation

We use loglevel for client-side logging, configured in `src/utils/client-logger.ts`:

```typescript
import log from 'loglevel';
import { v4 as uuidv4 } from 'uuid';

// Configure based on environment
if (process.env.NODE_ENV === 'production') {
  log.setLevel('warn');
} else {
  log.setLevel((process.env.LOG_LEVEL as log.LogLevelDesc) || 'debug');
}

// Queue for batching logs in production
const logQueue: any[] = [];
const MAX_QUEUE_SIZE = 10;
const FLUSH_INTERVAL = 5000; // 5 seconds
```

### Batch Processing

Client logs are batched to reduce network requests:

```typescript
function queueLog(logData: any, level: string) {
  logQueue.push({
    ...logData,
    level,
    timestamp: logData.timestamp || new Date().toISOString()
  });
  
  // If queue is full, flush immediately
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    flushLogs();
    return;
  }
  
  // Set up a timer to flush logs if not already set
  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, FLUSH_INTERVAL);
  }
}
```

### Sampling

High-volume logs are sampled in production to reduce overhead:

```typescript
// Sampling rates for different log levels (production only)
const samplingRates = {
  trace: 0.01,  // 1% of trace logs
  debug: 0.05,  // 5% of debug logs
  info: 0.2,    // 20% of info logs
  warn: 1.0,    // 100% of warnings
  error: 1.0    // 100% of errors
};

function shouldSample(level: string): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true; // Always log in non-production
  }
  
  const rate = samplingRates[level as keyof typeof samplingRates] || 1.0;
  return Math.random() < rate;
}
```

### Business Event Logging

Dedicated API for logging business-relevant events:

```typescript
export const businessEvents = {
  chatStarted: (userId?: string, agentType?: string) => {
    const logger = createLogger('business:events');
    logger.info({
      event: 'chat_started',
      userId,
      agentType,
      timestamp: new Date().toISOString()
    }, 'New chat conversation started');
  },
  
  messageSent: (userId?: string, messageLength?: number, agentType?: string) => {
    const logger = createLogger('business:events');
    logger.info({
      event: 'message_sent',
      userId,
      messageLength,
      agentType,
      timestamp: new Date().toISOString()
    }, 'User message sent');
  },
  
  // Additional business events...
}
```

### Component Logging

Components like `DeepSearchButton`, `NewChatButton`, and `ChatHistoryDropdown` use the client logger to log user interactions and component lifecycle events:

```typescript
const logger = createLogger('components:deep-search-button');

export function DeepSearchButton({ onSearch, query, disabled = false }: DeepSearchButtonProps) {
  const handleClick = async () => {
    const startTime = performance.now();
    logger.debug('DeepSearch button clicked', { 
      query,
      queryLength: query.length,
      timestamp: new Date().toISOString()
    });
    
    try {
      await onSearch(query);
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      
      logger.info('DeepSearch completed', { 
        query,
        queryLength: query.length,
        durationMs: duration,
        success: true
      });
    } catch (error) {
      logger.error('DeepSearch failed', { 
        query,
        errorMessage,
        durationMs: duration
      });
    }
  };
}
```

## Error Handling

### Error Boundary

We've implemented an `ErrorBoundary` component in `components/error-boundary.tsx` to catch and log errors in React components:

```typescript
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error({
      componentName: componentName || 'unknown',
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    }, `Error in component ${componentName || 'unknown'}`);
  }
}
```

### Global Error Handler

We've implemented a global error handler in `app/error.tsx` to catch and log unhandled errors:

```typescript
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error({
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      errorDigest: error.digest,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }, 'Global application error');
  }, [error]);
}
```

## Remote Logging

We've implemented a client-logs API route in `app/api/client-logs/route.ts` to collect client-side logs on the server:

```typescript
export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || 'unknown';
  const requestLogger = log.child({ requestId });
  
  try {
    // Handle both single log and batch logs
    const body = await req.json();
    const logs = Array.isArray(body) ? body : [body];
    
    // Process each log based on sampling
    let processedCount = 0;
    
    for (const clientLog of logs) {
      const level = mapLogLevel(clientLog.level);
      
      // Apply sampling
      if (!shouldSample(level)) {
        continue;
      }
      
      processedCount++;
      
      // Log to server with appropriate level and context
      const contextLogger = log.child({ 
        clientSessionId: sessionId,
        clientNamespace: namespace,
        clientTimestamp: timestamp,
        requestId
      });
      
      // Use the appropriate log level method
      contextLogger[level](message || 'Client log', data);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Processed ${processedCount} of ${logs.length} logs` 
    });
  } catch (error) {
    // Error handling
  }
}
```

## Best Practices Implemented

1. **Structured Logging**: All logs use JSON format with consistent fields
2. **Context Preservation**: Request IDs and session IDs are passed through the system
3. **Performance Metrics**: Response times and operation durations are logged
4. **Error Details**: Errors include message, name, stack trace, and context
5. **Environment Awareness**: Different log levels for development and production
6. **Consistent Naming**: Namespaced loggers for easy filtering
7. **Appropriate Log Levels**: Using the right level for each type of message
8. **Sensitive Data Protection**: No PII or secrets in logs
9. **Remote Logging Support**: Client logs sent to server for centralized storage
10. **Batch Processing**: Client logs are batched to reduce network overhead
11. **Sampling**: High-volume logs are sampled in production
12. **Business Event Tracking**: Dedicated API for business-relevant events

## Future Improvements

1. **Log Aggregation**: Integrate with a log aggregation service like DataDog, Loggly, or ELK
2. **Log Rotation**: Implement log rotation for server logs
3. **Alerting**: Set up alerts for critical errors
4. **Sampling**: Implement intelligent sampling for high-volume logs
5. **Correlation**: Enhance correlation between client and server logs
6. **Metrics**: Extract metrics from logs for monitoring dashboards
7. **User Session Tracking**: Improve tracking of user sessions across requests
8. **Performance Profiling**: Add more detailed performance metrics
9. **Log Enrichment**: Add more context to logs (user info, feature flags, etc.)
10. **Anomaly Detection**: Implement anomaly detection for error patterns 