# Enhanced Logging System for Next.js + Vercel + Supabase

This document describes our enhanced logging system designed for Next.js applications with Supabase vector search capabilities. The system provides optimized logging for both development and production environments.

## Key Features

### 1. Environment-Aware Formatting

- **Development**: Human-readable logs with colors, proper indentation, and special formatting for complex data
- **Production**: JSON structured logs optimized for Vercel's log viewer and searchability

### 2. Specialized Loggers

Our system includes several specialized loggers for different components:

| Logger | Purpose | Key Features |
|--------|---------|-------------|
| `baseLogger` | Foundation for all loggers | Environment detection, formatting, error handling |
| `vectorLogger` | Vector search operations | Document preview formatting, similarity metrics |
| `aiLogger` | AI interactions | Token usage tracking, performance monitoring |
| `apiLogger` | API request tracking | Request/response timing, error handling |
| `clientLogger` | Browser-side logging | Error reporting, throttling |
| `edgeLogger` | Edge runtime (middleware) | Compatible with Vercel Edge functions |

### 3. Document Result Formatting

Vector search results are specially formatted for improved readability:

```
[INFO] 2025-03-08T08:29:44.844Z Vector search for query (69 chars)

  Documents:
    [1] Doc 3128 (66%)
        ________________ 4. What role do negative keywords play in removing people with the wrong inten...
    [2] Doc 3144 (61%)
        4. Refresh Extensions: Keep callouts, structured snippets, and promotions up to date with new offers...
    [3] Doc 3129 (61%)
        * Quality Score Boost: Google rewards high relevance. When your keywords, ad copy, and landing page ...
    [4] Doc 3161 (61%)
        By maintaining this cycle of testing, measuring, and refining, you'll consistently lower your cost p...
    [5] Doc 3145 (61%)
        Answer: Even if your ad targeting is perfect, a lackluster landing page can cause potential client...

  {
    "operation": "vector_results",
    "queryLength": 69,
    "resultCount": 5,
    "averageSimilarity": 0.62,
    "highestSimilarity": 0.66,
    "lowestSimilarity": 0.61,
    "durationMs": 757,
    "sessionId": "cixxx0xyqqw"
  }
```

## Logger Usage Guide

### Base Logger

The foundation for all logging in the application:

```typescript
import { logger } from '@/lib/logger';

// Basic usage
logger.debug('Debugging information', { key: 'value' });
logger.info('User logged in', { userId: '123' });
logger.warn('Resource running low', { resourceId: 'abc', usage: 95 });
logger.error('Operation failed', { error: new Error('Database connection failed') });

// Mark important logs for production visibility
logger.info('Critical business event', { orderId: '123', important: true });
```

### Vector Logger

Specialized for vector search operations:

```typescript
import { logger as vectorLogger } from '@/lib/logger/vector-logger';

// Log embedding creation
vectorLogger.logEmbeddingCreation('doc-123', { contentType: 'article' });

// Log vector search results
vectorLogger.logVectorResults(
  'user query text',
  documentResults,
  searchMetrics,
  'session-123'
);

// Wrap a vector operation with performance tracking
const result = await tracedVectorOperation(
  'search',
  () => performVectorSearch(query),
  { query, params: { threshold: 0.65 } }
);
```

## Development vs. Production

### Development Mode

In development mode, the system provides:

- Colorized output for different log levels
- Pretty-printed JSON for complex objects
- Special formatting for document results
- Detailed error information with stack traces
- Higher verbosity with all debug logs visible

Example development log:
```
[INFO] 2025-03-08T12:34:56.789Z Vector search completed
  {
    "queryLength": 42,
    "resultCount": 3,
    "durationMs": 124
  }

  Documents:
    [1] Marketing Guide (73%)
        The essential guide to Facebook marketing starts with understanding your audience...
    [2] Ad Strategies (68%)
        When creating Google Ads campaigns, focus on these key performance indicators...
    [3] SEO Tips (62%)
        The foundation of good SEO begins with proper keyword research and content...
```

### Production Mode

In production, the system:

- Outputs single-line JSON for Vercel's log dashboard
- Limits log volume by only showing errors, warnings, and important info logs
- Includes full context for error diagnostics
- Maintains consistent correlation IDs for request tracing

Example production log:
```json
{"level":"info","message":"Vector search completed","operation":"vector_results","queryLength":42,"resultCount":3,"averageSimilarity":0.68,"durationMs":124,"important":true,"timestamp":"2025-03-08T12:34:56.789Z"}
```

## Performance Logging

The system automatically tracks and flags slow operations:

- **Vector Searches**: Warns when searches exceed 500ms
- **API Responses**: Logs when API responses take more than 1000ms
- **AI Completions**: Tracks token usage and completion time

Each performance log includes:
- Duration in milliseconds
- Operation type and context
- Result metrics (count, token usage, etc.)

## Correlation IDs

Request correlation is maintained through:

- `x-request-id` headers in middleware
- Session IDs for vector operations
- User and conversation IDs for chat operations

This allows tracing requests across the entire application stack.

## Extending the System

### Adding a New Specialized Logger

```typescript
// my-feature-logger.ts
import { logger as baseLogger } from '@/lib/logger/base-logger';

export const myFeatureLogger = {
  logOperation: (operation: string, context: Record<string, any> = {}) => {
    baseLogger.info(`My feature ${operation}`, {
      operation: `my_feature_${operation}`,
      ...context,
      important: context.important || false
    });
  },
  
  logError: (operation: string, error: any, context: Record<string, any> = {}) => {
    baseLogger.error(`My feature error: ${operation}`, {
      operation: `my_feature_${operation}`,
      error,
      ...context
    });
  }
};
```

## Best Practices

1. **Mark Important Logs**: Add `important: true` to ensure critical logs appear in production
2. **Use Structured Context**: Always include relevant context as structured data
3. **Error Objects**: Pass full error objects rather than just messages
4. **Correlation IDs**: Include session/request IDs for traceability
5. **Sensitive Data**: Never log passwords, tokens, or sensitive information
6. **Document Results**: Use the specialized document formatters for vector search results
7. **Performance Tracking**: Use the trace wrappers for operation performance monitoring

## Conclusion

This logging system balances the needs of development and production environments while providing specialized capabilities for vector operations. It focuses on developer experience in development mode and efficient machine-parseable logs in production.