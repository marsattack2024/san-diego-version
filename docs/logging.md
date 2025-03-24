# Logging System Documentation

## Overview

The San Diego Version application uses a streamlined logging system optimized for a small team (1-5 developers) and moderate user base (~250 users). The system provides rich development-time logging while maintaining efficient production logging through Vercel.

## Core Components

### 1. Unified Logger Interface (`lib/logger/index.ts`)

```typescript
import { logger } from '@/lib/logger';

// Automatic environment detection
logger.info('Message');  // Uses edge-logger on server, client-logger in browser

// Explicit logger selection
logger.server.info('Server-only message');
logger.client.info('Client-only message');
```

### 2. Context Management (`lib/logger/context.ts`)

```typescript
import { withContext, getContext } from '@/lib/logger';

await withContext({ requestId: 'req123' }, async () => {
  logger.info('Operation'); // Automatically includes requestId
});
```

### 3. Log Batching for API Routes

```typescript
export default withRequestTracking(async function handler(req, res) {
  const batch = logger.startBatch(req.requestId);
  
  try {
    await doSomething();
    batch.addOperation('step1');
    batch.complete('Success');
  } catch (error) {
    batch.error('Failed', error);
  }
});
```

## Development Features

### Visual Formatting
- Emoji indicators for log levels:
  - 🔴 Error
  - 🟠 Warning
  - 🔵 Info
  - ⚪ Debug
- Simplified timestamps
- Grouped context data
- Pretty-printed objects

Example:
```
🔵 14:23:45 User authenticated (duration: 123ms, session: abc123)
  metadata={role: "user", provider: "github"}
```

### Development-Only Features
- Full debug logging
- No sampling
- Detailed operation timing
- Rich error stacks
- Request/response logging

## Production Features

### Log Sampling
- Errors: 100%
- Warnings: 100%
- Info: 10%
- Debug: 1%

### Automatic Features
- Log deduplication
- Performance monitoring
- Resource usage tracking
- Error aggregation

### Security
- Sensitive data masking
- Environment variable protection
- Request ID tracking
- User ID hashing

## Context & Timing

### Available Context Fields
```typescript
interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  sessionId?: string;
  path?: string;
  startTime?: number;
  metadata?: Record<string, any>;
}
```

### Timing Helpers
```typescript
const context = createTimedContext({ operation: 'task' });
// ... do work ...
const elapsed = getElapsedTime(); // Returns ms since context creation
```

## Best Practices

### 1. Production Logging
- Mark important logs:
  ```typescript
  logger.info('Critical operation', { important: true });
  ```
- Include operation context:
  ```typescript
  logger.info('User action', { operation: 'profile_update' });
  ```
- Use batching for API routes:
  ```typescript
  const batch = logger.startBatch(requestId);
  ```

### 2. Error Handling
- Include error context:
  ```typescript
  try {
    await operation();
  } catch (error) {
    logger.error('Operation failed', { error, context: data });
  }
  ```
- Use error tracking in client:
  ```typescript
  logger.client.error('Client error', { error, url: window.location.href });
  ```

### 3. Performance Monitoring
- Track slow operations:
  ```typescript
  await logger.trackOperation('task', async () => {
    // Automatically logs if duration > 500ms
  });
  ```

### 4. Security
- Never log sensitive data:
  ```typescript
  // ❌ BAD
  logger.info('Login', { password, token });
  
  // ✅ GOOD
  logger.info('Login', { userId: hashedId });
  ```

## Environment Validation

The system includes secure environment validation:

```typescript
import { validateEnvironment } from '@/lib/env-validator';

if (!validateEnvironment()) {
  process.exit(1);
}
```

Required variables are checked without exposing values in logs.

## Migration from Legacy Loggers

The following loggers have been deprecated and consolidated:
- ❌ `chat-logger.ts` → Use `logger.info()`
- ❌ `base-logger.ts` → Use `logger.server`
- ❌ `api-logger.ts` → Use `logger.trackOperation()`
- ❌ `vector-logger.ts` → Use `logger.server`
- ❌ `ai-logger.ts` → Use `logger.server`

Update existing imports to use the unified logger:
```typescript
// ❌ OLD
import { chatLogger } from '@/lib/logger/chat-logger';
chatLogger.info('Message');

// ✅ NEW
import { logger } from '@/lib/logger';
logger.info('Message');
```
