Logging System Documentation
(Last Updated: March 28, 2025)

Overview
The application uses a minimal, focused logging system optimized for a small team managing ~250 users. The system prioritizes essential operational metrics while reducing noise and adhering to strict security and performance guidelines.

Core Features
The logging system is designed to provide comprehensive insights while remaining scalable and unobtrusive in production environments.

Essential Log Categories and Levels
All logs are categorized for better filtering and analysis:

AUTH: Authentication and authorization
CHAT: Chat interactions and agent routing
TOOLS: RAG, Deep Search, Web Scraping, other function calls
LLM: Large Language Model operations
SYSTEM: Application infrastructure, startup, core services
CACHE: Cache operations (Redis, in-memory)
API: API route operations and request handling
DB: Database operations and queries
SEARCH: Search operations (non-vector)
VECTOR: Vector database operations
TITLE: Chat title generation operations
EVENTS: Event handling and propagation
Each log uses a standard level, often indicated visually:

debug (no emoji): Detailed information for development only (filtered out in production).
info (🔵): General operational information.
warn (🟡/🟠): Potential issues or significant events (like slow operations) that don't prevent operation.
error (🔴): Actual errors that impact functionality.
Production Sampling Strategy
In production, to manage volume while maintaining visibility:

#### Server-Side Sampling
- ERROR level logs and logs explicitly marked important: true are always retained (100%)
- Other logs (info, warn without important: true) are sampled based on their category:
  - AUTH: 20%
  - CHAT, TOOLS, LLM: 10% 
  - CACHE (Hits): 10%
  - CACHE (Misses/Errors), SYSTEM: 100%
  - API: 20%
  - DB, VECTOR: 50%
  - TITLE: 10%

#### Client-Side Sampling
Client logs are sampled at different rates to reduce network traffic:
- trace: 1%
- debug: 5%
- info: 20%
- warn: 100%
- error: 100%

The important: true flag should only be used for critical errors, timeouts, or operations exceeding the IMPORTANT_THRESHOLD.
Structured Log Format
All logs follow a consistent JSON-like structure (represented here in key-value format for readability):

Plaintext

{Emoji} {Timestamp} {Message} ({Category})
  level={level}
  category={category}
  // --- Core Context ---
  message="{Human-readable description}"
  timestamp="{ISO 8601 Timestamp}"
  // --- Optional Common Fields ---
  chatId={chatId}
  userId={maskedUserId}
  operationId={unique-operation-identifier} // e.g., ragOperationId, requestId
  requestId={uuid-short} // Request lifecycle tracking ID
  durationMs={duration} // For timed operations
  slow={true|false} // If duration > SLOW_OPERATION
  important={true|false} // If error/timeout or duration > IMPORTANT_THRESHOLD
  // --- Operation Specific Fields ---
  status={operation_status} // e.g., completed, completed_from_cache, no_matches, failed, timeout
  fromCache={true|false} // For cacheable operations
  resultsCount={count}
  // ... other context ...
Automatic Performance Metrics
Operation durations are logged via the durationMs field.
Operations exceeding SLOW_OPERATION threshold get level=warn and slow=true.
Operations exceeding IMPORTANT_THRESHOLD (a higher value) also get important=true.
These thresholds are currently global constants defined in the logger configuration.
Production Logging Examples
Application Startup
Plaintext

🔵 {Timestamp} Application started (system)
  level=info
  category=system
  environment=production
  region=iad1
  version=a1b2c3d
  services=database:configured,ai:configured
  important=false
(Ensured via singleton pattern to log only ONCE per instance)

RAG Operations (Single Completion Log)
Plaintext

// Normal operation
🔵 {Timestamp} RAG operation completed (tools)
  level=info category=tools ragOperationId=rag-abc durationMs=850 resultsCount=3 slow=false important=false status=completed fromCache=false

// Cache Hit
🔵 {Timestamp} RAG operation completed (tools)
  level=info category=tools ragOperationId=rag-xyz durationMs=50 resultsCount=3 slow=false important=false status=completed_from_cache fromCache=true

// Slow operation
🟡 {Timestamp} RAG operation completed (tools)
  level=warn category=tools ragOperationId=rag-def durationMs=2150 resultsCount=5 slow=true important=false status=completed fromCache=false

// Important operation
🟠 {Timestamp} RAG operation completed (tools)
  level=warn category=tools ragOperationId=rag-ghi durationMs=5150 resultsCount=2 slow=true important=true status=completed fromCache=false

// Timeout
🔴 {Timestamp} RAG operation timed out (tools)
  level=error category=tools ragOperationId=rag-jkl durationMs=10023 queryPreview=How can I reduce... important=true status=timeout
Error Conditions
Plaintext

🔴 {Timestamp} Database query failed (system)
  level=error category=system operation=user_preferences error="Connection timeout" durationMs=5000 important=true
API Requests
Plaintext

// Normal
🔵 {Timestamp} API request completed (chat)
  level=info category=chat path=/api/chat method=POST requestId=req-123 durationMs=150 status=200 slow=false important=false

// Slow
🟡 {Timestamp} API request completed (chat)
  level=warn category=chat path=/api/chat method=POST requestId=req-456 durationMs=2500 status=200 slow=true important=false
Cache Operations
Plaintext

// Cache Hit (Sampled)
🔵 {Timestamp} Cache get (cache)
  level=info category=cache key=global:rag:abc hit=true durationMs=45

// Cache Miss (Always Logged)
🟡 {Timestamp} Cache get (cache)
  level=warn category=cache key=global:rag:def hit=false durationMs=30
Development Features
In development (NODE_ENV=development):

debug level logs are enabled and included.
Console output may be pretty-printed for readability.
Sampling is disabled; all logs are shown.
Logs may include additional context (full queries in RAG, parameters, intermediate steps).
Detailed stack traces are included with errors.
Perplexity DeepSearch Logging
DeepSearch operations follow the standard TOOLS category logging principles:

Intermediate steps (cache checks, API calls) may be logged at debug level.
A single completion log (level=info or warn/error) is emitted, similar to RAG examples.
Includes operationId, durationMs, slow, important flags based on thresholds.
Includes an accurate fromCache flag (verified post-fix).
Includes queryPreview on errors/timeouts only.
Internal logs within the Perplexity route handler (/api/perplexity) use debug level and correct important=false for routine steps (verified post-fix).
Plaintext

// Example Deep Search Completion
🔵 {Timestamp} Deep Search completed (tools)
  level=info category=tools operationId=deepsearch-abc durationMs=11346 resultsCount=5 slow=true important=true status=completed fromCache=false // Example: slow & important
Recent Improvements Summary

✅ **Verbosity Reduction**: Middleware, session updates, user object retrieval, memory checkpoints moved to debug level.

✅ **RAG Logging**: Consolidated to a single, accurate completion log per operation (including cache hits with status=completed_from_cache), fixed duration/count issues, corrected important flag usage.

✅ **Perplexity/DeepSearch**: Internal logs moved to debug, incorrect important=true flags removed, fromCache flag logic fixed.

✅ **Structure**: Consistent level field added, important=true usage corrected across all logs.

✅ **Startup**: Duplicate startup logs eliminated via singleton pattern in edge-logger.ts, ensuring each application instance logs startup only once.

✅ **Security**: Full query and cookie logging eliminated. User ID masking implemented with maskSensitiveData function.

✅ **Request Tracing**: Added unique requestId to track complete request lifecycles across all log entries, supporting correlation with the context propagation system.

✅ **Error Handling**: Implemented retry logic with exponential backoff for database operations to improve resilience.

✅ **Privacy**: Enhanced user ID masking in logs to show only first/last characters with `${userId.substring(0, 4)}...${userId.slice(-4)}` pattern.

✅ **Correlation**: Ensured all related log entries within a request share the same requestId for easier debugging through the context tracking system.

✅ **Specialized Loggers**: Added dedicated loggers for chat operations, title generation, and client-side logging.

✅ **Context Propagation**: Implemented a context tracking system in context.ts for maintaining context across asynchronous operations.
Best Practices
(Copied and verified from final Logging Rules document)

RAG & External API Monitoring:
Assign unique IDs (ragOperationId, deepSearchId, etc.).
Log durationMs, outcome (status field like 'completed', 'completed_from_cache', 'no_matches', 'timeout', 'failed'), slow status, important status.
For failures/timeouts, log level=error, important=true, include truncated queryPreview.
Consolidate: Aim for ONE completion log per operation.
Performance Thresholds:
TypeScript

const THRESHOLDS = {
  RAG_TIMEOUT: 10000,      // 10 seconds (triggers error log)
  SLOW_OPERATION: 2000,    // 2 seconds (triggers level=warn, slow=true)
  // Log basic info (respecting sampling); add detailed timing/flags only if durationMs > 1000
  LOG_THRESHOLD: 1000,
  IMPORTANT_THRESHOLD: 5000 // Mark important=true if durationMs > 5000 (and level=warn)
};
Error Handling:
Use try/catch. Log errors at level=error with important=true.
Include category, operation, error.message, relevant IDs.
Security:
Never log full user queries/inputs in production. Use truncated queryPreview (max ~50 chars) ONLY on error/timeout.
Never log authentication cookies or sensitive headers.
Mask sensitive IDs (userId, sessionId).
Exclude credentials, API keys, full environment variables.
Sampling & Filtering:
Apply category sampling rates in production.
Always log all ERROR level events and all events marked important: true, regardless of category sampling.
Configure production environments to filter out and discard debug level logs.
Use debug Level Appropriately:
Use level=debug for verbose tracing useful ONLY during development.
Apply this especially to internal helper functions or wrappers around external tools (e.g., detailed steps within Perplexity/Deep Search API handlers).
Do not use debug for operational status, warnings, or errors.
Logging Sub-Processes (e.g., Web Scraping):
Log the start, completion (with durationMs, outcome/status), and errors of distinct sub-processes like web scraping.
Use appropriate categories (e.g., 'tools') and levels.
Logging Data Validation/Correction:
Use level=warn (🟡/🟠) to log significant data validation issues or automatic corrections applied to responses.
Logging Long-Lived Connections (SSE):
Avoid Misleading Durations: Standard framework request logs for SSE show total connection time. Document this in the route handler code.
Recommended Logging: Use custom logs (level=info) to mark SSE connection established (with connectionId) and SSE connection closed (with connectionId and connectionDurationMs). Log SSE-specific errors at level=error.
Implementation Details

### Logger Components
- `lib/logger/edge-logger.ts`: Core logging engine for Edge-compatible environments
- `lib/logger/constants.ts`: Log categories, levels, and operation types
- `lib/logger/context.ts`: Request context management and propagation
- `lib/logger/index.ts`: Exports unified logger interface
- `lib/logger/client-logger.ts`: Client-side logging implementation
- `lib/logger/chat-logger.ts`: Specialized logger for chat operations
- `lib/logger/title-logger.ts`: Specialized logger for title generation

### Specialized Loggers
The system includes specialized loggers for specific operations:

1. **Chat Logger (`chat-logger.ts`)**
   - Tracks chat request lifecycles
   - Monitors tool usage
   - Calculates complete request durations
   - Provides chat-specific metadata

2. **Title Logger (`title-logger.ts`)**
   - Tracks title generation operations
   - Monitors AI model performance for titles
   - Logs title caching and reuse

3. **Client Logger (`client-logger.ts`)**
   - Handles browser-side logging
   - Batches client logs for efficient transmission
   - Implements client-side sampling

### Context Propagation
The `context.ts` module provides a powerful mechanism for:
- Tracking request context across asynchronous operations
- Propagating requestId, userId, sessionId, and other metadata
- Timing operations automatically
- Supporting nested operations with proper parent-child relationships

This allows for correlated logging across complex operations with minimal boilerplate code.

## Widget Chat Logging

The widget chat implementation has some logging differences compared to the main chat:

1. **Anonymous Sessions:** Widget sessions typically use an anonymous user (`userId=anon...mous`)
2. **Limited Persistence:** Message persistence is disabled for anonymous sessions
3. **RAG Logging:** All RAG operations are fully logged at the document retrieval level
4. **Cache Logging:** Cache hits and misses are logged in the cache service
5. **Missing Tool Usage Logs:** Anonymous sessions don't log tool usage in the message persistence flow

### Tracking RAG Performance in Widget

To track RAG performance and cache effectiveness in widget sessions:

1. **RAG Operation ID:** Track operations by their `ragOperationId`
2. **Cache Hit Status:** Look for `fromCache: true` and `source: 'cache'` in RAG logs
3. **Performance Metrics:** All RAG operations include `durationMs`, `retrievalTimeMs` metrics
4. **Document Similarity:** RAG results include `topSimilarityScore`, `avgSimilarityScore`

### Example: Widget RAG Cache Hit Log

```
🔵 Using cached RAG results (tools, 58ms, rag_search)
  ragOperationId=rag-ltr95z
  documentCount=3
  documentIds=["doc123","doc456","doc789"]
  topSimilarityScore=0.92
  source=cache
  durationMs=58
  slow=false
  important=false
  status=completed_from_cache
```

### Main Chat vs Widget Log Comparison

**Main Chat Flow (Authenticated User):**
```
1. Knowledge base search started
2. RAG operation with cache check
3. Using cached RAG results (if applicable)
4. Knowledge base search completed
5. Tool calls executed (in chat engine)
6. Assistant message saved (with tool usage)
```

**Widget Chat Flow (Anonymous User):**
```
1. Knowledge base search started
2. RAG operation with cache check
3. Using cached RAG results (if applicable)
4. Knowledge base search completed
5. "Skipping assistant message persistence" (due to anonymous user)
```

The widget chat logs will not show the tool usage in the message persistence logs because message persistence is disabled for anonymous sessions. However, this doesn't affect the actual functionality of RAG or caching - both operate identically.
Migration Notes
Replace all console.log calls with appropriate logger methods (edgeLogger.debug, .info, .warn, .error).
Ensure correct level and category are provided.
Add relevant context (IDs, metrics).

Monitoring Guidelines
Errors: Monitor level=error logs. Group by category and operation.
Performance: Monitor level=warn logs, especially where slow=true or important=true. Analyze durationMs trends by category/operation. Investigate /api/events durations.
RAG/Tool Health: Filter by category=tools. Monitor RAG/DeepSearch logs for high durationMs, errors/timeouts, low resultsCount, or unexpected status.
API Usage: Analyze API request logs (requestId, path, status, durationMs).
Cache Effectiveness: Monitor category=cache logs (level=warn for misses). Monitor RAG logs for status=completed_from_cache.