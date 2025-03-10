# Enhanced Logging System for Next.js + Vercel + Supabase

This document describes our comprehensive logging system designed for Next.js applications with specialized support for AI operations, vector search, and client-side error reporting. The system adapts its behavior based on the environment (development, production, testing) to balance verbosity with performance.

## Core Logger Architecture

### Hierarchy

The logging system follows a hierarchical design:

1. **Base Logger** (`lib/logger/base-logger.ts`)
   - Foundation for all logging
   - Environment detection and format switching
   - Core log levels: debug, info, warn, error

2. **Specialized Loggers**
   - **Vector Logger** (`lib/logger/vector-logger.ts`): Optimized for vector search/embeddings
   - **AI Logger** (`lib/logger/ai-logger.ts`): AI model operations tracking
   - **API Logger** (`lib/logger/api-logger.ts`): API endpoint performance monitoring
   - **Client Logger** (`lib/logger/client-logger.ts`): Browser-side logging
   - **Edge Logger** (`lib/logger/edge-logger.ts`): Edge runtime compatible
   - **Agent Logger** (`lib/agents/core/agent-logger.ts`): Agent operation tracking
   - **Chat Logger** (`lib/logger/chat-logger.ts`): Chat-specific operations

3. **Utility Functions**
   - `tracedVectorOperation`: Performance-tracked vector operations
   - `tracedAIOperation`: Token usage and performance for AI operations
   - `withLogging`: API handler wrapper for request logging

## Environment-Aware Behavior

### Development Mode

- Full colorized console output
- Pretty-printed structured data
- Special formatting for errors and complex data
- All debug logs visible
- No sampling (all logs shown)
- Enhanced readability for document previews
- Line breaks for better visualization

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

- JSON-formatted single-line logs for Vercel's log dashboard
- Optimized for machine processing and structured querying
- Log sampling to reduce volume based on importance
- Extra context included for error diagnostics
- Only important info logs, all warnings, and all errors shown

Example production log:
```json
{"level":"info","message":"Vector search completed","operation":"vector_results","queryLength":42,"resultCount":3,"averageSimilarity":0.68,"durationMs":124,"important":true,"timestamp":"2025-03-08T12:34:56.789Z"}
```

### Testing Mode

- Simplified output optimized for test runners
- Support for mocking and verification
- Dedicated test files in `scripts/tests/logging.test.ts`

## Specialized Loggers

### Vector Logger

Monitors vector database operations and formats document results:

```typescript
import { logger as vectorLogger } from '@/lib/logger/vector-logger';

// Log vector search results with document previews
vectorLogger.logVectorResults(
  userQuery,
  documentResults,
  {
    retrievalTimeMs: 120,
    averageSimilarity: 0.72,
    highestSimilarity: 0.85,
    lowestSimilarity: 0.62
  },
  sessionId
);

// Performance tracking for vector operations
const results = await tracedVectorOperation(
  'search',
  () => performVectorSearch(query),
  { query, params: { threshold: 0.65 } }
);
```

### AI Logger

Monitors AI model interactions with token usage tracking:

```typescript
import { logger, tracedAIOperation } from '@/lib/logger/ai-logger';

// Wrap AI operations with performance tracking
const completion = await tracedAIOperation(
  () => openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: userPrompt }]
  }),
  {
    requestId: requestId,
    model: "gpt-4",
    promptTokens: calculateTokens(userPrompt)
  }
);

// Log model performance directly
logger.logInferenceComplete(
  "gpt-4", 
  2100, 
  {
    promptTokens: 450,
    completionTokens: 320,
    totalTokens: 770
  }
);
```

### API Logger

Wraps API route handlers with request/response logging:

```typescript
import { withLogging } from '@/lib/logger/api-logger';

// Using the HOC pattern to wrap API handlers
export default withLogging(async function handler(req, res) {
  // Your handler code here
  // All requests, responses, and errors will be automatically logged
});
```

### Client Logger

Browser-side logging with throttling and error reporting:

```typescript
import { clientLogger } from '@/lib/logger/client-logger';

// Basic usage
clientLogger.info('User interaction', { 
  action: 'button_click',
  component: 'SearchButton' 
});

// Error reporting (only important errors sent to server)
try {
  // some operation
} catch (error) {
  clientLogger.error('Operation failed', { 
    component: 'SearchComponent',
    action: 'fetchResults',
    error
  });
}
```

### Agent Logger

For agent operations with context tracking:

```typescript
import { createAgentLogger } from '@/lib/agents/core/agent-logger';

const logger = createAgentLogger('default', {
  sessionId: 'session-123',
  conversationId: 'conv-456'
});

logger.info('Agent processing request', {
  toolsUsed: ['vector-search', 'web-search'],
  processingTime: 350
});
```

## Performance Monitoring

The system automatically tracks and warns about slow operations:

- **Vector Searches**: Warnings when searches exceed 500ms
- **API Responses**: Warnings when endpoints take more than 1000ms
- **AI Completions**: Warnings when model inference exceeds 2000ms

Each performance log includes:
- Operation duration
- Context about the operation
- Resource metrics (token usage, result count)
- Helpful thresholds to identify bottlenecks

## Client-Side Error Reporting

Browser errors are reported to the server through two mechanisms:

1. **Error Endpoint** (`/api/client-error.ts`):
   - Used for critical errors
   - Includes browser context and stack traces
   - Throttled to prevent flooding

2. **Logs Endpoint** (`/api/client-logs/route.ts`):
   - Supports batch log processing
   - Implements sampling based on log level
   - Maps client levels to server levels
   - Maintains correlation IDs

## Request Correlation and Tracing

Correlation is maintained through:

- `x-request-id` headers in API requests
- Session IDs for extended operations
- Child loggers with inherited context
- UUID generation for new requests
- Consistent ID propagation across components

Example of correlation:

```typescript
// Middleware adds request ID
const requestId = req.headers['x-request-id'] || uuidv4();

// Create a correlated logger
const requestLogger = logger.child({ requestId });

// Later in the request lifecycle
requestLogger.info('Processing request step 2', { 
  step: 'validation'
});
```

## Debug View for Development

In development mode, loggers create enhanced output:

- Colorized console messages
- Special formatting for errors with stack traces
- Document previews with content snippets
- Indented JSON for readability
- Structured output sections

## Log Sampling in Production

To control volume in production, the system employs sampling:

```typescript
// Sampling rates from client-logs/route.ts
const samplingRates = {
  trace: 0.01,  // 1% of trace logs
  debug: 0.05,  // 5% of debug logs
  info: 0.2,    // 20% of info logs
  warn: 1.0,    // 100% of warnings
  error: 1.0    // 100% of errors
};
```

This ensures critical issues are always logged while routine operations are sampled to reduce noise.

## Testing the Logging System

The system includes dedicated tests in `scripts/tests/logging.test.ts`:

```bash
# Run logging tests
npm run test:logging

# View output to verify formatting
```

The test suite verifies:
- Proper formatting in different environments
- Special handling for errors and complex data
- Vector result formatting
- Log level filtering

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
3. **Use Child Loggers**: Create child loggers with context for better tracing
4. **Full Error Objects**: Pass error objects rather than just messages to preserve stack traces
5. **Performance Tracking**: Use the trace wrappers for operation monitoring
6. **Environment Awareness**: Logs are handled differently based on environment - keep this in mind
7. **Correlation IDs**: Maintain IDs across operations for request tracing
8. **Avoid Sensitive Data**: Never log passwords, tokens, or sensitive information

## Debugging in Production

When debugging production issues:

1. **Vercel Logs**: Access the Vercel dashboard log viewer
2. **Filter by Correlation ID**: Use the requestId to trace a user journey
3. **Filter by Operation Type**: Find all logs of a specific operation
4. **Timestamps**: Use timestamps to correlate with user reports
5. **Error Context**: Review full error context including stack traces

## Local Development

For local development, logs are optimized for readability:

1. All log levels are visible, including debug
2. Colorized output helps distinguish levels
3. Document previews show content snippets
4. Structured data is pretty-printed with indentation

## Conclusion

This logging system balances the needs of development, testing, and production environments while providing specialized capabilities for different application components. It focuses on developer experience in development and efficient, structured logs in production with built-in performance monitoring.