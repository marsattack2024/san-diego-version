# Logging System Documentation

## Overview

The application uses a minimal, focused logging system optimized for a small team managing ~250 users. The system prioritizes essential operational metrics while reducing noise.

## Core Features

### 1. Essential Log Categories & Levels
```typescript
const categories = {
  AUTH: 'auth',     // Authentication events
  CHAT: 'chat',     // Chat interactions
  TOOLS: 'tools',   // Tool operations
  LLM: 'llm',       // Language model interactions
  SYSTEM: 'system', // Critical system events
  CACHE: 'cache'    // Cache operations (added for clarity)
};

// Log Levels: Emojis correspond to standard levels: 🔵=INFO, 🟡=WARN, 🔴=ERROR.
// Use `debug` level only in development for verbose tracing.
```

### 2. Sampling Strategy (Production)

- **Category Sampling:** Logs are initially candidates based on category rates:
    - `AUTH`: 20%
    - `CHAT`, `TOOLS`, `LLM`, `CACHE` (hits): 10%
    - `SYSTEM`, `CACHE` (misses/errors): 100%
- **Overrides:** All logs marked `important: true` and all ERROR level logs (🔴) are **always** kept, regardless of the category sampling outcome.

### 3. Production Logging Examples

#### Startup Information
```typescript
// Single startup log with essential service status
🔵 Application started
  level=info
  environment=production
  region=iad1
  version=a1b2c3d
  services=database:configured,ai:configured
```

#### RAG Operation Tracking
```typescript
// Normal RAG operation (duration < LOG_THRESHOLD)
🔵 RAG operation completed
  level=info
  category=tools
  ragOperationId=rag-1679665432123-abc
  results=3

// Normal RAG operation (duration > LOG_THRESHOLD but < SLOW_OPERATION)
🔵 RAG operation completed
  level=info
  category=tools
  ragOperationId=rag-1679665432123-def
  durationMs=1350 // Duration logged as > LOG_THRESHOLD
  results=2

// Slow RAG operation (duration > SLOW_OPERATION but < IMPORTANT_THRESHOLD)
🟡 RAG operation completed
  level=warn
  category=tools
  ragOperationId=rag-1679665432123-ghi
  durationMs=2150
  results=5
  slow=true // Marked as slow

// Very Slow / Important RAG operation (duration > IMPORTANT_THRESHOLD)
🟠 RAG operation completed // Using Orange for important warnings, distinct from Red errors
  level=warn
  category=tools
  ragOperationId=rag-1679665432123-x7y9z
  durationMs=5150
  results=5
  slow=true
  important=true // Marked as important

// Timed out RAG operation
🔴 RAG operation timed out
  level=error
  category=tools
  ragOperationId=rag-1679665432123-jkl
  durationMs=10023
  queryPreview=How can I reduce... // Truncated query preview ONLY for error/timeout
  important=true
```

#### Error Conditions
```typescript
// Full error details
🔴 Database query failed
  level=error
  category=system // Or relevant category like 'auth' if specific
  operation=user_preferences
  error=Connection timeout
  durationMs=5000
  important=true
```

### 4. Development Features

Development mode includes additional context while maintaining clarity. `debug` level logs are active.

```typescript
// Service status on startup
🔵 Application started
  level=info
  environment=development
  services=database:configured,ai:configured
  development.port=3000
  development.logLevel=debug

// Detailed Operation timing / info
🔵 Chat completion
  level=debug // Or info if it's a key step to log even in prod (respecting sampling)
  category=llm
  durationMs=750
  model=gpt-4
  tokens=1250
  // Example dev-only detail:
  // parameters={ temperature: 0.5, maxTokens: 100 }

// Development logs can include non-sensitive parameters, truncated intermediate results,
// or finer-grained step timings to trace execution flow.
```

## Best Practices

### 1. Application Startup Logging
- Use a **singleton pattern** to ensure startup is logged exactly once per application instance.
- Store a module-level variable to track if startup has been logged: `APPLICATION_STATE.startupLogged = true`.
- Implement startup logging in the application root layout/entry point, not at module import time.
- Only mark startup as `important: true` if there are configuration issues that require attention.
- Include service status in the format `services=database:configured,ai:configured`.
- In serverless environments, avoid firing startup logs from the top level of modules.

```typescript
// Good practice: Singleton pattern for startup logging
const APPLICATION_STATE = {
  startupLogged: false,
  startTime: Date.now()
};

// Function to log startup once
function logApplicationStartup() {
  if (APPLICATION_STATE.startupLogged) return;
  
  APPLICATION_STATE.startupLogged = true;
  const envCheck = checkEnvironment();
  
  edgeLogger.info('Application started', {
    category: 'system',
    environment: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION || 'local',
    version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    services: envCheck.summary,
    important: !envCheck.valid // Only important if there are issues
  });
}

// Using in application entry point
// In app/layout.tsx:
export default function RootLayout({ children }) {
  logApplicationStartup(); // Will only log once
  // ...
}
```

### 2. RAG Operation Monitoring
- Track all RAG operations with unique IDs.
- Monitor operation duration and result counts.
- Automatically clean up stale operations.
- Log timeouts with relevant context and `level=error`.

### 3. Agent Routing Optimization
- Use appropriate log levels (`debug` for details, `info` for decisions).
- Always include `category: 'chat'` for proper sampling.
- Add early-exit logic for informational queries to skip unnecessary scoring.
- Only log detailed scores/intermediate steps at `debug` level (development).
- Include `important: true` only for critical routing events/failures.
- Avoid duplicate logs between logger implementations (use `edgeLogger` primarily in edge).
- Log final agent selection once at `info` level with context.

```typescript
// Good practice: Info-level log for significant routing decision
🔵 Auto-routed to specialized agent
  level=info
  category=chat
  selectedAgent=copywriting
  score=12
  threshold=5
  // important: true // Only if failure to route correctly is critical

// Good practice: Debug-level logging for routine default routing
🔵 Using default agent // Use debug level
  level=debug
  category=chat
  reason='No agent scored above threshold'
  highestScore=3
  threshold=5
```

### 4. Performance Thresholds
```typescript
// Production thresholds
const THRESHOLDS = {
  RAG_TIMEOUT: 10000,      // 10 seconds (triggers error log)
  SLOW_OPERATION: 2000,    // 2 seconds (triggers level=warn, slow=true)
  LOG_THRESHOLD: 1000,     // Log basic info (respecting sampling); add detailed timing/flags only if durationMs > 1000
  IMPORTANT_THRESHOLD: 5000 // Mark as important=true if durationMs > 5000 (and level=warn)
};
```

### 5. Error Handling
```typescript
try {
  await ragOperation();
} catch (error) {
  // Use appropriate logger (edgeLogger or logger)
  logger.error('RAG operation failed', {
    // level=error is implicit
    category: 'tools', // Or more specific category
    operation: 'vector_search',
    error: error.message, // Log error message, consider logging stack in dev
    important: true,
    ragOperationId: 'rag-123'
  });
}
```

### 6. Security
- **Avoid logging user queries in production by default.** A *truncated preview* MAY be logged ONLY in specific error or timeout scenarios (`level=error`) for critical debugging. Never log full queries during routine operations.
- Mask sensitive User IDs and Session IDs if they must be logged.
- Only log service status/configuration keys, never full credentials or secrets.

### 7. Guidance on `important=true`
- This flag should highlight events needing operational attention or significantly impacting user experience.
- Reserve for: Errors (`level=error`), Timeouts, Critical Failures, Severe Performance Degradation (e.g., duration > `IMPORTANT_THRESHOLD`).
- Avoid using it for routine successes or minor slowdowns below the `IMPORTANT_THRESHOLD`.

## Production Guidelines

1.  **RAG Operations**
    - Track all operations with unique IDs.
    - Monitor for timeouts (`>RAG_TIMEOUT`, log as error).
    - Flag slow (`>SLOW_OPERATION`) and important (`>IMPORTANT_THRESHOLD`) operations.
    - Follow the sampling strategy.
2.  **Agent Routing**
    - Log final routing decisions at `info` level (sampled).
    - Keep detailed scoring/steps at `debug` level (dev only).
    - Optimize scoring for simple queries.
    - Always include `category: 'chat'`.
3.  **Request Logs** (Assuming standard HTTP request logging middleware)
    - Log status code and duration for incoming requests.
    - Mark slow operations (`>SLOW_OPERATION`).
    - Sample these logs if volume is high (often done by infrastructure).
4.  **Error Logs**
    - Log at `error` level.
    - Include full error context (message, relevant IDs, operation).
    - Include timing and metadata where applicable.
    - Always include relevant operation/trace IDs.
    - These are NOT sampled (always kept).
5.  **Performance Logs**
    - Track operations exceeding `SLOW_OPERATION` and `IMPORTANT_THRESHOLD`.
    - Monitor essential service health metrics (e.g., DB connection pool, external API latency).
    - Record resource usage samples if needed (CPU, Memory - often infrastructure-provided).
6.  **Cache Operations**
    ```typescript
    // Redis cache hit (Sampled 10%)
    🔵 Redis cache hit
      level=info
      category=CACHE
      operation=rag_search // Source operation using cache
      key=rag:a1b2c3
      durationMs=45
      // size=2.5KB // Optional: Log size if relevant

    // Redis cache miss (Logged 100%)
    🟡 Redis cache miss
      level=warn // Warn level encourages checking cache effectiveness
      category=CACHE
      operation=web_scrape
      key=scrape:x7y9z
      fallback=true // Optional: if fallback cache used
      fallbackType=lru // Optional

    // Cache error (Logged 100%)
    🔴 Redis cache error
      level=error
      category=CACHE
      operation=deepsearch
      error=ConnectionTimeout
      important=true
      // fallback=false // Optional
    ```

### Cache Logging Best Practices

1.  **Redis Cache Events**
    - Log all cache misses (`level=warn`).
    - Sample cache hits (`level=info`, 10% rate).
    - Always log errors (`level=error`). Log fallbacks if applicable.
    - Monitor hit rates by operation/category.
2.  **LRU Cache Events** (In-memory)
    - Log only at `debug` level (development only).
    - Track eviction rates, memory usage, cache pressure events in dev if needed.
3.  **Cache Performance**
    - Track Redis operation latency (`durationMs` on cache logs).
    - Monitor cache size growth (via Redis tooling).
    - Log cache cleanup events if manually triggered.
    - Calculate hit/miss ratios from logs or monitoring tools.

### Logger Selection Guidelines

1.  **Edge Environments** (Middleware, Vercel Edge Routes, etc.)
    - Always use `edgeLogger`.
    - Include appropriate `category` for sampling.
    - Use `debug` level for detailed info not needed in production (will be filtered out).
2.  **Server Environment** (Node.js backend, longer-running processes)
    - Use standard `logger` (assuming a different instance/configuration).
    - Avoid duplicating logs already emitted by the edge layer for the same request.
    - Consider the context (request-bound vs background task) when determining log content.

## Migration Guide

### Remove
❌ Git/VSCode configuration logs
❌ Full environment variable dumps (log only necessary keys/status)
❌ Node.js/npm internal configuration noise
❌ Framework internal/verbose debugging logs
❌ Development tool status logs
❌ Duplicate logs between different loggers (e.g., edge vs server for same event)
❌ Routine logging of full user queries/inputs
❌ Duplicate startup logs across multiple places

### Keep
✅ RAG/Tool operation metrics (ID, duration, status, key results)
✅ API performance metrics (request duration, status codes)
✅ Error conditions with context (error message, operation, IDs)
✅ Slow/Important operation warnings (flagged based on thresholds)
✅ Security-relevant events (Auth successes/failures - sampled, permission issues)
✅ Important agent routing decisions (final selection, critical failures)
✅ Cache performance (hits - sampled, misses, errors)
✅ Single, informative application startup log

