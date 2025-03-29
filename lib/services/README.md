# Services Architecture

This directory contains service modules that encapsulate external API calls and business logic. These services are designed to be used by the Vercel AI SDK tools in the chat engine.

## Design Principles

1. **Separation of Concerns**:
   - Service modules handle external API calls and data processing
   - Tool modules in `lib/chat-engine/tools` define the AI SDK interface and use these services

2. **Dependency Direction**:
   - Tools depend on services (not the other way around)
   - Services have no knowledge of the tool layer

3. **Single Responsibility**:
   - Each service focuses on a single external integration or capability

4. **Error Handling**:
   - Consistent error logging patterns across all services
   - Proper fallback mechanisms for recoverable errors
   - Detailed context in error logs for debugging

## Services Overview

### Message Persistence Service (`message-persistence.ts`)

Handles saving and retrieving chat messages to/from the Supabase database.

- Used by: `lib/chat-engine/core.ts`
- Capabilities:
  - Asynchronous message saving (non-blocking)
  - Historical message retrieval
  - Client disconnect resilience
  - Consistent error handling with fallbacks

### Perplexity Service (`perplexity.service.ts`)

Provides an interface for performing web searches via the Perplexity API.

- Used by: `lib/chat-engine/tools/deep-search.ts`
- Capabilities:
  - API initialization and validation
  - Error handling and retry logic
  - Request formatting
  - Response processing

### Puppeteer Service (`puppeteer.service.ts`)

Provides an interface for extracting content from web pages using a Puppeteer-based scraper.

- Used by: `lib/chat-engine/tools/web-scraper.ts`
- Capabilities:
  - URL validation and sanitization
  - Content extraction from web pages
  - Caching for improved performance
  - Error handling and logging

### Vector Search Service (`vector-search.service.ts`)

Provides an interface for embedding generation and vector search using Supabase.

- Used by: `lib/chat-engine/tools/rag-tool.ts` (via `lib/vector/documentRetrieval.ts`)
- Capabilities:
  - Embedding generation for documents
  - Semantic search on vector data
  - Document storage and retrieval
  - Caching and performance optimization

## Recent Improvements

The services have been enhanced with several important improvements:

### 1. Consistent Error Handling

A standardized approach to error handling has been implemented across all services:

```typescript
/**
 * Helper function to log errors consistently
 */
function logError(logger: typeof edgeLogger, operation: string, error: unknown, context: Record<string, any> = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`Error in ${operation}`, {
        operation,
        error: errorMessage,
        stack: errorStack,
        ...context
    });

    return errorMessage;
}
```

This pattern ensures:
- Uniform error logging across services
- Capture of both error messages and stack traces
- Additional context for debugging
- Centralized error handling logic

### 2. Client Creation Abstraction

Common patterns for creating clients (like Supabase connections) have been refactored into dedicated methods:

```typescript
/**
 * Creates a Supabase client based on configuration
 * Uses admin client if bypassAuth is true, with fallback to standard client
 */
private async createSupabaseClient(context: Record<string, any> = {}) {
    const useAdminClient = this.config.bypassAuth === true;
    try {
        if (useAdminClient) {
            edgeLogger.info('Using admin client to bypass RLS', {
                operation: this.operationName,
                ...context
            });
            return await createAdminClient();
        } else {
            return await createClient();
        }
    } catch (error) {
        logError(edgeLogger, this.operationName, error, {
            useAdminClient,
            ...context,
            action: 'creating_client'
        });

        // Fall back to the standard client if admin client fails
        if (useAdminClient) {
            edgeLogger.info('Falling back to standard client', {
                operation: this.operationName
            });
            return await createClient();
        }
        throw error;
    }
}
```

This improves:
- Code maintainability
- Error recovery through fallback mechanisms
- Consistent logging of client creation

### 3. Performance Tracking

All service operations now include performance tracking:

```typescript
const startTime = Date.now();
try {
    // Operation logic
} finally {
    edgeLogger.info('Operation completed', {
        operation: this.operationName,
        executionTimeMs: Date.now() - startTime
    });
}
```

This allows for:
- Identifying performance bottlenecks
- Tracking operation durations
- Setting up alerting for slow operations

## Implementation Pattern

All services follow a similar implementation pattern:

1. A class that encapsulates the service functionality
2. Constructor that initializes connections and cache
3. Public methods for the main service capabilities
4. Private helper methods for internal logic
5. Comprehensive logging and error handling
6. Exported as a singleton instance

```typescript
// Pattern for service implementation
class ServiceName {
    constructor() {
        // Initialize connections, cache, etc.
    }

    public serviceMethod(): ReturnType {
        // Public method for service capability
    }

    private helperMethod(): void {
        // Internal helper method
    }
}

// Export as singleton
export const serviceName = new ServiceName();
```

## Usage Example

```typescript
// In a tool file
import { serviceName } from '@/lib/services/service-name.service';

export const exampleTool = tool({
    // ...
    execute: async ({ param1, param2 }, options) => {
        // Use the service
        const result = await serviceName.serviceMethod(param1, param2);
        return result;
    }
});
``` 