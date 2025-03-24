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

#### Request Metrics
```typescript
// API performance tracking
🔵 POST /api/chat completed
  duration=850ms
  status=200
  slow=false

// Slow operation tracking
🟠 Vector search completed
  duration=2150ms
  results=5
  slow=true
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

### 1. Essential Logging Only
- Log startup status and service configuration
- Track API request performance
- Record errors with full context
- Monitor slow operations (>1000ms)

### 2. Performance Monitoring
```typescript
// Track operation duration
logger.info('Chat completion', {
  category: 'chat',
  duration: 750,
  tokens: 1250,
  important: duration > 1000
});
```

### 3. Error Handling
```typescript
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', {
    operation: 'chat_completion',
    error,
    important: true
  });
}
```

### 4. Security
- Never log sensitive environment variables
- Mask user IDs and session IDs
- Only log service status, not credentials

## Production Guidelines

1. **Startup Logs**
   - Single startup log with service status
   - No environment variable dumps
   - No development configuration

2. **Request Logs**
   - Status code and duration
   - Mark slow operations (>1000ms)
   - Sample by category to reduce volume

3. **Error Logs**
   - Full error context
   - Stack traces in development
   - Operation timing and metadata

4. **Performance Logs**
   - Track slow operations
   - Monitor service health
   - Record resource usage samples

## Migration Guide

### Remove
❌ Git/VSCode configuration logs
❌ Full environment variable dumps
❌ Node.js/npm configuration
❌ Framework internal logs
❌ Development tool status

### Keep
✅ Service health checks
✅ API performance metrics
✅ Error conditions with context
✅ Slow operation warnings
✅ Security-related events
