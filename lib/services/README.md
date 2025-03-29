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

## Services Overview

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