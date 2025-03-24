# Logging System Documentation

## Overview

The application uses a minimal, focused logging system optimized for a small team managing ~250 users. The system prioritizes essential operational metrics while reducing noise.

## Core Features

### 1. Essential Log Categories
```typescript
const categories = {
  AUTH: 'auth',     // Authentication events (20% sampling)
  CHAT: 'chat',     // Chat interactions (10% sampling)
  TOOLS: 'tools',   // Tool operations (10% sampling)
  LLM: 'llm',       // Language model interactions (10% sampling)
  SYSTEM: 'system'  // Critical system events (100% sampling)
};
```

### 2. Production Logging

#### Startup Information
```typescript
// Single startup log with essential service status
🔵 Application started
  environment=production
  region=iad1
  version=a1b2c3d
  services=database:configured,ai:configured
```

#### RAG Operation Tracking
```typescript
// Normal RAG operation
🔵 RAG operation completed
  ragOperationId=rag-1679665432123-x7y9z
  durationMs=850
  results=3
  slow=false

// Slow RAG operation
🟠 RAG operation completed
  ragOperationId=rag-1679665432123-x7y9z
  durationMs=2150
  results=5
  slow=true
  important=true

// Timed out RAG operation
🔴 RAG operation timed out
  ragOperationId=rag-1679665432123-x7y9z
  durationMs=10023
  query=How can I reduce my cost per lead...
  important=true
```

#### Error Conditions
```typescript
// Full error details
🔴 Database query failed
  operation=user_preferences
  error=Connection timeout
  duration=5000ms
```

### 3. Development Features

Development mode includes additional context while maintaining clarity:

```typescript
// Service status on startup
🔵 Application started
  environment=development
  services=database:configured,ai:configured
  development.port=3000
  development.logLevel=debug

// Operation timing
🔵 Chat completion
  duration=750ms
  model=gpt-4
  tokens=1250
```

## Best Practices

### 1. RAG Operation Monitoring
- Track all RAG operations with unique IDs
- Monitor operation duration and result counts
- Automatically clean up stale operations
- Log timeouts with relevant context

### 2. Performance Thresholds
```typescript
// Production thresholds
const THRESHOLDS = {
  RAG_TIMEOUT: 10000,      // 10 seconds
  SLOW_OPERATION: 2000,    // 2 seconds
  LOG_THRESHOLD: 1000,     // Only log operations > 1s in production
  IMPORTANT_THRESHOLD: 5000 // Mark as important if > 5s
};
```

### 3. Error Handling
```typescript
try {
  await ragOperation();
} catch (error) {
  logger.error('RAG operation failed', {
    operation: 'vector_search',
    error,
    important: true,
    ragOperationId: 'rag-123'
  });
}
```

### 4. Security
- Never log full queries in production
- Mask user IDs and session IDs
- Only log service status, not credentials

## Production Guidelines

1. **RAG Operations**
   - Track all operations with unique IDs
   - Monitor for timeouts (>10s)
   - Clean up stale operations
   - Sample logs based on duration

2. **Request Logs**
   - Status code and duration
   - Mark slow operations (>2s)
   - Sample by category to reduce volume

3. **Error Logs**
   - Full error context
   - Operation timing and metadata
   - Always include operation IDs

4. **Performance Logs**
   - Track slow operations
   - Monitor service health
   - Record resource usage samples

5. **Cache Operations**
   ```typescript
   // Redis cache hit
   🔵 Redis cache hit
     category=CACHE
     operation=rag_search
     key=rag:a1b2c3
     durationMs=45
     size=2.5KB

   // Redis cache miss with fallback
   🟡 Redis cache miss
     category=CACHE
     operation=web_scrape
     key=scrape:x7y9z
     fallback=true
     fallbackType=lru

   // Cache error
   🔴 Redis cache error
     category=CACHE
     operation=deepsearch
     error=ConnectionTimeout
     important=true
     fallback=false
   ```

### Cache Logging Best Practices

1. **Redis Cache Events**
   - Log all cache misses in production
   - Sample cache hits (10% in production)
   - Always log errors and fallbacks
   - Track hit rates by category

2. **LRU Cache Events**
   - Log only in development
   - Track eviction rates
   - Monitor memory usage
   - Log cache pressure events

3. **Cache Performance**
   - Track Redis operation latency
   - Monitor cache size growth
   - Log cache cleanup events
   - Record hit/miss ratios

## Migration Guide

### Remove
❌ Git/VSCode configuration logs
❌ Full environment variable dumps
❌ Node.js/npm configuration
❌ Framework internal logs
❌ Development tool status

### Keep
✅ RAG operation metrics
✅ API performance metrics
✅ Error conditions with context
✅ Slow operation warnings
✅ Security-related events
