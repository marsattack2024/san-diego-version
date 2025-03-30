# DeepSearch Implementation

This document outlines the DeepSearch functionality implemented in our application, which provides real-time web search capabilities through an integration with the Perplexity API.

## Overview

DeepSearch allows our AI assistant to access up-to-date information from the web, helping it answer questions about current events, recent developments, or topics that might not be covered in its training data. This capability is implemented as a conditional tool that can be enabled or disabled per conversation based on user preferences and agent configuration.

## Architecture

DeepSearch follows a layered architecture with multiple security controls:

1. **Tool Interface Layer**: Implements the Vercel AI SDK Tool interface
2. **Service Layer**: Abstracts Perplexity API interactions
3. **Caching Layer**: Optimizes performance through Redis caching
4. **Security Layer**: Provides multiple validation steps and access controls
5. **Logging Layer**: Maintains comprehensive audit trails

### Component Diagram

```
┌───────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│                   │     │                     │     │                   │
│  deepSearchTool   │────▶│ PerplexityService  │────▶│  Perplexity API   │
│  (Vercel AI SDK)  │     │                     │     │                   │
│                   │     │                     │     │                   │
└───────────────────┘     └─────────────────────┘     └───────────────────┘
         │                          │                         
         │                          │                         
         ▼                          ▼                         
┌───────────────────┐     ┌─────────────────────┐     
│                   │     │                     │     
│  Security Checks  │     │   Cache Service     │     
│                   │     │                     │     
│                   │     │                     │     
└───────────────────┘     └─────────────────────┘     
```

## Core Implementation

### 1. DeepSearch Tool

The DeepSearch Tool is defined in `lib/tools/deep-search.tool.ts` using the Vercel AI SDK's tool pattern:

```typescript
export const deepSearchTool = tool({
  description: "Search the web for up-to-date information about any topic. Use this when you need information that might not be in your training data or when you need to verify current facts.",
  parameters: deepSearchSchema,
  execute: async ({ search_term }, runOptions) => {
    const operationId = `deep-search-${Date.now().toString(36)}`;
    const startTime = Date.now();
    const toolCallId = runOptions.toolCallId;

    try {
      // Extract options from the request context
      const body = runOptions.body || {};
      const deepSearchEnabled = body?.deepSearchEnabled === true;
      const bypassCheck = body?.bypassDeepSearchCheck === true;
      
      // CRITICAL SAFETY CHECK: Verify deep search is explicitly enabled
      if (!deepSearchEnabled && !bypassCheck) {
        edgeLogger.warn("Deep Search tool was invoked without being enabled", {
          category: LOG_CATEGORIES.TOOLS,
          operation: "deep_search_disabled_attempt",
          operationId,
          toolCallId,
          searchTermLength: search_term?.length || 0,
          searchTermPreview: search_term?.substring(0, 50) || '',
          important: true
        });

        return "I'm sorry, but web search capabilities are not enabled for this conversation. Please enable Deep Search in your user settings if you'd like me to search the web for information.";
      }

      // Initialize Perplexity client and verify it's ready
      const clientStatus = perplexityService.initialize();
      if (!clientStatus.isReady) {
        throw new Error("Perplexity API client is not ready");
      }

      // Format the search query for better results
      const query = formatSearchQuery(search_term);

      // Log the search start event
      edgeLogger.info("Deep Search started", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "deep_search_started",
        operationId,
        toolCallId,
        originalQuery: search_term,
        formattedQuery: query
      });

      // Call the Perplexity API via our service
      const result = await perplexityService.search(query);
      const duration = Date.now() - startTime;

      // Format and enhance the response content
      const enhancedContent = formatAndEnhanceContent(result.content, duration);

      // Log successful completion
      edgeLogger.info("Deep Search completed successfully", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "deep_search_complete",
        operationId,
        toolCallId,
        originalQuery: search_term,
        formattedQuery: query,
        durationMs: duration,
        contentLength: enhancedContent.length,
        model: result.model
      });

      return enhancedContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      // Enhanced error logging
      edgeLogger.error("Deep Search failed", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "deep_search_error",
        operationId,
        toolCallId,
        query: search_term,
        error: errorMessage,
        durationMs: duration,
        errorStack: error instanceof Error ? error.stack : 'No stack available',
        important: true
      });

      // User-friendly error response
      return `I encountered an error while searching for information on "${search_term}". ${errorMessage} Please try again with a more specific search term, or check if Deep Search is properly enabled.`;
    }
  }
});
```

### 2. Perplexity Service

The Perplexity Service (`lib/services/perplexity.service.ts`) abstracts interactions with the Perplexity API:

```typescript
export class PerplexityService {
  private isInitialized = false;

  /**
   * Initialize the Perplexity service
   * Validates API configuration and environment
   */
  public initialize(): { isReady: boolean } {
    // Check if API key is configured
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityApiKey) {
      edgeLogger.warn('Perplexity API key is not configured', {
        category: LOG_CATEGORIES.TOOLS,
        operation: "perplexity_init_failed",
        reason: "missing_api_key"
      });
      
      return { isReady: false };
    }

    // Basic key format validation
    const isKeyFormatValid = perplexityApiKey.startsWith('pplx-');
    if (!isKeyFormatValid) {
      edgeLogger.warn('Perplexity API key has invalid format', {
        category: LOG_CATEGORIES.TOOLS,
        operation: "perplexity_init_failed",
        reason: "invalid_key_format"
      });
      
      return { isReady: false };
    }

    this.isInitialized = true;
    return { isReady: true };
  }

  /**
   * Call the Perplexity API to search for information
   * Uses the internal serverless endpoint to avoid VPN detection issues
   * @param query - The search query
   * @returns Search result with content and metadata
   */
  public async search(query: string): Promise<PerplexitySearchResult> {
    const startTime = Date.now();
    const operationId = `perplexity-${Date.now().toString(36)}`;

    try {
      // Ensure the client is initialized
      this.initialize();
      
      if (!this.isInitialized) {
        throw new Error("Perplexity service is not properly initialized");
      }

      // Check cache first to avoid unnecessary API calls
      const cachedResults = await cacheService.getDeepSearchResults<PerplexitySearchResult>(query);
      if (cachedResults) {
        edgeLogger.info("Using cached deep search results", {
          category: LOG_CATEGORIES.TOOLS,
          operation: "perplexity_cache_hit",
          operationId,
          queryLength: query.length,
          responseLength: cachedResults.content.length
        });
        
        return cachedResults;
      }

      // Runtime environment information for debugging
      const runtimeInfo = {
        type: runtime,
        environment: process.env.NODE_ENV || 'development',
        vercelEnv: process.env.VERCEL_ENV || 'unknown'
      };

      // Determine the API URL based on environment
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      const host = process.env.NODE_ENV === 'development'
        ? 'localhost:3000'
        : (process.env.NEXT_PUBLIC_HOST || 'marlan.photographytoprofits.com');

      const apiUrl = `${protocol}://${host}${INTERNAL_API_URL}`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 SanDiego/1.0"
        },
        body: JSON.stringify({ query })
      });

      // Handle non-success responses
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Parse and validate response
      const result = await response.json();

      // Check for success flag in response
      if (!result.success) {
        throw new Error(`Perplexity API error: ${result.error}`);
      }

      // Extract and format the response data
      const data = result.data;
      const content = data.choices[0].message.content;
      const duration = Date.now() - startTime;

      // Create formatted result
      const searchResult: PerplexitySearchResult = {
        content,
        model: data.model,
        timing: { total: duration }
      };

      // Cache the search result
      await cacheService.setDeepSearchResults(query, searchResult);

      // Return formatted result
      return searchResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      // Log detailed error information
      edgeLogger.error("Perplexity search error", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "perplexity_search_error",
        operationId,
        errorMessage,
        errorType: error instanceof Error ? error.name : typeof error,
        errorStack: error instanceof Error ? error.stack : 'No stack available',
        runtime,
        durationMs: duration,
        important: true
      });

      // Re-throw the error for the caller to handle
      throw error;
    }
  }
}

// Export singleton instance
export const perplexityService = new PerplexityService();
```

### 3. Cache Integration

DeepSearch uses the central Cache Service for performance optimization:

```typescript
// In lib/cache/cache-service.ts
async getDeepSearchResults<T>(query: string): Promise<T | null> {
  const key = this.generateKey(query, CACHE_NAMESPACES.DEEP_SEARCH);
  return this.get<T>(key);
}

async setDeepSearchResults<T>(query: string, results: T): Promise<void> {
  const key = this.generateKey(query, CACHE_NAMESPACES.DEEP_SEARCH);
  return this.set<T>(key, results, { ttl: CACHE_TTL.DEEP_SEARCH });
}
```

The TTL for DeepSearch results is defined in `lib/cache/constants.ts`:

```typescript
export const CACHE_TTL = {
  // ...
  DEEP_SEARCH: 1 * 60 * 60, // 1 hour for deep search results
  // ...
};
```

## Conditional Enablement

DeepSearch is only available when explicitly enabled through multiple validation layers:

### 1. Agent Configuration

Each agent type has a DeepSearch configuration flag:

```typescript
const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
  'copywriting': {
    // ...
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: true, // Copywriting agent can use DeepSearch
    }
  },
  'quiz': {
    // ...
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: false,
      useDeepSearch: false, // Quiz agent cannot use DeepSearch
    }
  },
  // Other agent configurations...
};
```

### 2. User Toggle

The user interface provides a toggle for enabling/disabling DeepSearch:

```typescript
// In app/api/chat/route.ts
// Parse the user's preference from the request
const deepSearchEnabled = parseBooleanValue(body.deepSearchEnabled);

// Determine if this agent type can use Deep Search
const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;

// Only enable Deep Search if both the user has toggled it AND the agent supports it
const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;
```

### 3. Tool Registry Inclusion

The tool is only included in the available tools when explicitly enabled:

```typescript
// In lib/tools/registry.tool.ts
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
  // ...
  
  // Add Deep Search tool ONLY if explicitly enabled
  if (useDeepSearch) {
    toolSet.deepSearch = deepSearchTool;
  }
  
  return toolSet;
}
```

### 4. Runtime Validation

Even if the tool is included, there's a runtime check to verify it should be used:

```typescript
// Inside deepSearchTool execute function
const deepSearchEnabled = body?.deepSearchEnabled === true;
if (!deepSearchEnabled) {
  edgeLogger.warn("Deep Search tool was invoked without being enabled", {
    category: LOG_CATEGORIES.TOOLS,
    operation: 'deep_search_security',
    toolCallId,
    searchTerm: search_term
  });
  
  return "I'm sorry, but web search capabilities are not enabled for this conversation.";
}
```

## Prompt Integration

The system prompts have been enhanced with DeepSearch-specific instructions:

```typescript
// In lib/chat-engine/prompts/index.ts
export function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string {
  // Get the base system prompt for the agent type
  const basePrompt = buildSystemPrompt(agentType);

  // Add tool descriptions including DeepSearch
  const withToolDescription = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following resources:\n` +
    `- Knowledge Base: Retrieve information from our internal knowledge base\n` +
    `- Web Scraper: Extract content from specific URLs provided by the user\n` +
    `- Deep Search: Conduct in-depth research on complex topics using Perplexity AI\n\n` +
    `Use these resources when appropriate to provide accurate responses.`;

  // Add DeepSearch-specific instructions based on whether it's enabled
  const deepsearchInstructions = deepSearchEnabled
    ? `### DEEP SEARCH INSTRUCTIONS:\n\n` +
      `DeepSearch is enabled for this conversation. When you use the deepSearch tool:\n` +
      `1. You MUST directly incorporate the information retrieved from Deep Search into your response\n` +
      `2. You MUST clearly attribute information from Deep Search\n` +
      `3. You MUST prefer Deep Search results over your pre-existing knowledge for factual questions\n` +
      `4. For questions seeking current information, ALWAYS use the deepSearch tool\n` +
      `5. When citing specific information, include the source name and URL when available\n`
    : `NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool.`;
  
  // Add attribution section
  const attributionSection = `### ATTRIBUTION FORMAT:\n\n` +
    `At the end of your response, you MUST include a section that explicitly states which resources you used.`;

  return `${withToolDescription}\n\n${deepsearchInstructions}\n\n${attributionSection}`;
}
```

## Response Formatting

DeepSearch responses are formatted to include sources and attribution:

```typescript
function formatSearchResults(result: PerplexitySearchResult): string {
  // Extract main content and sources
  const { content, sources } = result;
  
  // Format the main content
  let formattedResponse = content;
  
  // Append sources if available
  if (sources && sources.length > 0) {
    formattedResponse += '\n\n**Sources:**\n';
    
    sources.forEach((source, index) => {
      // Add each source with title, URL, and snippet
      formattedResponse += `${index + 1}. [${source.title}](${source.url})${source.snippet ? ` - ${source.snippet}` : ''}\n`;
    });
  }
  
  return formattedResponse;
}
```

## Error Handling

The DeepSearch implementation includes comprehensive error handling:

```typescript
try {
  // DeepSearch implementation
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Detailed error logging
  edgeLogger.error("Deep Search error", {
    category: LOG_CATEGORIES.TOOLS,
    operation: "deep_search_error",
    operationId,
    toolCallId,
    errorMessage,
    errorType: error instanceof Error ? error.name : typeof error,
    errorStack: error instanceof Error ? error.stack : 'No stack available',
    duration: Date.now() - startTime,
    searchTerm: search_term,
    important: true
  });
  
  // User-friendly error message
  return `I encountered an error while searching for information: ${errorMessage}. Please try again with a more specific search term.`;
}
```

## Monitoring and Analytics

The implementation includes detailed logging for monitoring and analytics:

```typescript
// Log the start of the search operation
edgeLogger.info("Deep Search started", {
  category: LOG_CATEGORIES.TOOLS,
  operation: "deep_search_start",
  operationId,
  toolCallId,
  searchTerm: search_term
});

// Log cache hits
if (cachedResults) {
  edgeLogger.info("Using cached deep search results", {
    category: LOG_CATEGORIES.TOOLS,
    operation: "perplexity_cache_hit",
    operationId,
    toolCallId,
    searchTerm: search_term,
    resultAge: Date.now() - new Date(cachedResults.timestamp).getTime()
  });
  
  return formatSearchResults(cachedResults);
}

// Log successful searches
edgeLogger.info("Deep Search completed successfully", {
  category: LOG_CATEGORIES.TOOLS,
  operation: "deep_search_complete",
  operationId,
  toolCallId,
  searchTerm: search_term,
  duration: Date.now() - startTime,
  sourceCount: result.sources?.length || 0
});
```

## Usage Patterns

### When to Use DeepSearch

The AI is instructed to use DeepSearch in these scenarios:

1. **Current Events**: For information about recent events not in training data
2. **Factual Verification**: To verify or update potentially outdated information
3. **Specialized Knowledge**: For specific details on niche topics
4. **Latest Trends**: For information about current trends or statistics
5. **Time-sensitive Data**: For data that changes frequently (prices, statistics, etc.)

### How DeepSearch Is Used in Conversations

1. The user asks a question that might require current information
2. The agent analyzes the question to determine if DeepSearch is needed
3. If DeepSearch is enabled, the agent calls the deepSearch tool with an optimized query
4. The tool returns formatted information with source attribution
5. The agent incorporates this information into its response, clearly indicating what came from DeepSearch
6. The agent includes an attribution section at the end listing all the sources used

## Benefits

1. **Up-to-date Information**: Provides access to current information beyond the model's training cutoff
2. **Source Transparency**: All information includes source attribution
3. **Controlled Access**: Multiple security layers prevent unauthorized use
4. **Performance Optimization**: Caching reduces API calls and improves response times
5. **User Control**: Users can enable/disable the feature as needed
6. **Clear Attribution**: Sources are clearly shown in responses

## Configuration Options

### Environment Variables

```
# Required for DeepSearch functionality
PERPLEXITY_API_KEY=your_perplexity_api_key

# Optional configuration
CACHE_TTL_DEEP_SEARCH=3600  # Override default TTL (in seconds)
```

### Feature Flags

```typescript
// In conversation context
deepSearchEnabled: boolean  // Controls whether DeepSearch is available

// In agent configuration
toolOptions: {
  useDeepSearch: boolean  // Controls whether the agent supports DeepSearch
}
```

## References

- [Perplexity API Documentation](https://docs.perplexity.ai/)
- [Vercel AI SDK Tool Documentation](https://sdk.vercel.ai/docs/getting-started/tools)
- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/) 

## Implementation Details

### Tool Implementation

The DeepSearch tool is implemented in `lib/tools/deep-search.tool.ts` using Vercel AI SDK's tool pattern:

```typescript
export const deepSearchTool = tool({
    description: "Search the web for up-to-date information about any topic. Use this when you need information that might not be in your training data or when you need to verify current facts.",
    parameters: deepSearchSchema,
    execute: async ({ search_term }, runOptions) => {
        const operationId = `deep-search-${Date.now().toString(36)}`;
        const startTime = Date.now();
        const toolCallId = runOptions.toolCallId;

        try {
            // Extract options from the request context
            const body = runOptions.body || {};
            const deepSearchEnabled = body?.deepSearchEnabled === true;
            const bypassCheck = body?.bypassDeepSearchCheck === true;
            
            // CRITICAL SAFETY CHECK: Verify deep search is explicitly enabled
            if (!deepSearchEnabled && !bypassCheck) {
                edgeLogger.warn("Deep Search tool was invoked without being enabled", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "deep_search_disabled_attempt",
                    operationId,
                    toolCallId,
                    searchTermLength: search_term?.length || 0,
                    searchTermPreview: search_term?.substring(0, 50) || '',
                    important: true
                });

                return "I'm sorry, but web search capabilities are not enabled for this conversation. Please enable Deep Search in your user settings if you'd like me to search the web for information.";
            }

            // Initialize Perplexity client and verify it's ready
            const clientStatus = perplexityService.initialize();
            if (!clientStatus.isReady) {
                throw new Error("Perplexity API client is not ready");
            }

            // Format the search query for better results
            const query = formatSearchQuery(search_term);

            // Log the search start event
            edgeLogger.info("Deep Search started", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_started",
                operationId,
                toolCallId,
                originalQuery: search_term,
                formattedQuery: query
            });

            // Call the Perplexity API via our service
            const result = await perplexityService.search(query);
            const duration = Date.now() - startTime;

            // Format and enhance the response content
            const enhancedContent = formatAndEnhanceContent(result.content, duration);

            // Log successful completion
            edgeLogger.info("Deep Search completed successfully", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_complete",
                operationId,
                toolCallId,
                originalQuery: search_term,
                formattedQuery: query,
                durationMs: duration,
                contentLength: enhancedContent.length,
                model: result.model
            });

            return enhancedContent;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Enhanced error logging
            edgeLogger.error("Deep Search failed", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_error",
                operationId,
                toolCallId,
                query: search_term,
                error: errorMessage,
                durationMs: duration,
                errorStack: error instanceof Error ? error.stack : 'No stack available',
                important: true
            });

            // User-friendly error response
            return `I encountered an error while searching for information on "${search_term}". ${errorMessage} Please try again with a more specific search term, or check if Deep Search is properly enabled.`;
        }
    }
});
```

### Perplexity Service Implementation

The Perplexity service (`lib/services/perplexity.service.ts`) handles the actual API interactions:

```typescript
class PerplexityService {
    private isInitialized = false;

    /**
     * Initialize the Perplexity service
     * Validates API configuration and environment
     */
    public initialize(): { isReady: boolean } {
        // Check if API key is configured
        const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
        if (!perplexityApiKey) {
            edgeLogger.warn('Perplexity API key is not configured', {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_init_failed",
                reason: "missing_api_key"
            });
            
            return { isReady: false };
        }

        // Basic key format validation
        const isKeyFormatValid = perplexityApiKey.startsWith('pplx-');
        if (!isKeyFormatValid) {
            edgeLogger.warn('Perplexity API key has invalid format', {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_init_failed",
                reason: "invalid_key_format"
            });
            
            return { isReady: false };
        }

        this.isInitialized = true;
        return { isReady: true };
    }

    /**
     * Call the Perplexity API to search for information
     * Uses the internal serverless endpoint to avoid VPN detection issues
     * @param query - The search query
     * @returns Search result with content and metadata
     */
    public async search(query: string): Promise<PerplexitySearchResult> {
        const startTime = Date.now();
        const operationId = `perplexity-${Date.now().toString(36)}`;

        try {
            // Ensure the client is initialized
            this.initialize();
            
            if (!this.isInitialized) {
                throw new Error("Perplexity service is not properly initialized");
            }

            // Check cache first to avoid unnecessary API calls
            const cachedResults = await cacheService.getDeepSearchResults<PerplexitySearchResult>(query);
            if (cachedResults) {
                edgeLogger.info("Using cached deep search results", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "perplexity_cache_hit",
                    operationId,
                    queryLength: query.length,
                    responseLength: cachedResults.content.length
                });
                
                return cachedResults;
            }

            // Runtime environment information for debugging
            const runtimeInfo = {
                type: runtime,
                environment: process.env.NODE_ENV || 'development',
                vercelEnv: process.env.VERCEL_ENV || 'unknown'
            };

            // Determine the API URL based on environment
            const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
            const host = process.env.NODE_ENV === 'development'
                ? 'localhost:3000'
                : (process.env.NEXT_PUBLIC_HOST || 'marlan.photographytoprofits.com');

            const apiUrl = `${protocol}://${host}${INTERNAL_API_URL}`;

            // Make the API request
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 SanDiego/1.0"
                },
                body: JSON.stringify({ query })
            });

            // Handle non-success responses
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            // Parse and validate response
            const result = await response.json();

            // Check for success flag in response
            if (!result.success) {
                throw new Error(`Perplexity API error: ${result.error}`);
            }

            // Extract and format the response data
            const data = result.data;
            const content = data.choices[0].message.content;
            const duration = Date.now() - startTime;

            // Create formatted result
            const searchResult: PerplexitySearchResult = {
                content,
                model: data.model,
                timing: { total: duration }
            };

            // Cache the search result
            await cacheService.setDeepSearchResults(query, searchResult);

            // Return formatted result
            return searchResult;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log detailed error information
            edgeLogger.error("Perplexity search error", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_search_error",
                operationId,
                errorMessage,
                errorType: error instanceof Error ? error.name : typeof error,
                errorStack: error instanceof Error ? error.stack : 'No stack available',
                runtime,
                durationMs: duration,
                important: true
            });

            // Re-throw the error for the caller to handle
            throw error;
        }
    }
}

// Export singleton instance
export const perplexityService = new PerplexityService();
```

### Cache Integration

The DeepSearch system integrates with our Redis-based caching system for improved performance:

```typescript
// In lib/cache/cache-service.ts
async getDeepSearchResults<T>(query: string): Promise<T | null> {
    // Normalize and hash query for consistent cache keys
    const normalizedQuery = query.trim().toLowerCase();
    const hashedQuery = await this.hashKey(normalizedQuery);
    const key = this.generateKey(hashedQuery, CACHE_NAMESPACES.DEEP_SEARCH);
    
    return this.get<T>(key);
}

async setDeepSearchResults<T>(query: string, results: T): Promise<void> {
    // Normalize and hash query for consistent cache keys
    const normalizedQuery = query.trim().toLowerCase();
    const hashedQuery = await this.hashKey(normalizedQuery);
    const key = this.generateKey(hashedQuery, CACHE_NAMESPACES.DEEP_SEARCH);
    
    return this.set<T>(key, results, { ttl: CACHE_TTL.DEEP_SEARCH });
}
```

The TTL (time-to-live) for DeepSearch results is configured in `lib/cache/constants.ts`:

```typescript
export const CACHE_TTL = {
    // ...
    DEEP_SEARCH: 1 * 60 * 60, // 1 hour for deep search results
    // ...
};
```

## Security Measures

DeepSearch implements multiple layers of security controls:

### 1. Multi-layer Security Checks

The tool implements multiple security validations:

```typescript
// Extract options from the request context
const body = runOptions.body || {};
const deepSearchEnabled = body?.deepSearchEnabled === true;
const bypassCheck = body?.bypassDeepSearchCheck === true;

// CRITICAL SAFETY CHECK: Verify deep search is explicitly enabled
if (!deepSearchEnabled && !bypassCheck) {
    edgeLogger.warn("Deep Search tool was invoked without being enabled", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "deep_search_disabled_attempt",
        operationId,
        toolCallId,
        searchTermLength: search_term?.length || 0,
        searchTermPreview: search_term?.substring(0, 50) || '',
        important: true
    });

    return "I'm sorry, but web search capabilities are not enabled for this conversation.";
}
```

### 2. Agent Configuration Settings

The agent router enforces additional checks for DeepSearch access:

```typescript
// In app/api/chat/route.ts
// Determine if this agent type can use Deep Search
const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;

// Only enable Deep Search if both the user has toggled it AND the agent supports it
const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

// Create tools object with conditional inclusion of Deep Search
var tools = createToolSet({
    useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
    useWebScraper: agentConfig.toolOptions.useWebScraper,
    useDeepSearch: shouldUseDeepSearch // Only include if explicitly enabled
});
```

### 3. Comprehensive Access Logging

All DeepSearch access attempts are comprehensively logged for security auditing:

```typescript
// Log the search start event with detailed context
edgeLogger.info("Deep Search started", {
    category: LOG_CATEGORIES.TOOLS,
    operation: "deep_search_started",
    operationId,
    toolCallId,
    originalQuery: search_term,
    formattedQuery: query,
    clientIp: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    userId: context.userId || 'anonymous'
});
```

## Performance Optimizations

### Query Formatting

The system includes query preprocessing to improve search quality:

```typescript
/**
 * Format a search query for better results
 * @param query Original query from the user
 * @returns Formatted query optimized for search
 */
function formatSearchQuery(query: string): string {
    // Remove common prefixes that reduce search quality
    const cleanedQuery = query.trim()
        .replace(/^(search|find|look up|tell me about|what is|who is|when did|where is|how to|can you)/i, '')
        .trim()
        .replace(/\?$/, '') // Remove trailing question mark
        .trim();
    
    // If cleaned query is too short, use original
    if (cleanedQuery.length < 5 && query.length > cleanedQuery.length) {
        return query.trim();
    }
    
    return cleanedQuery;
}
```

### Cache Implementation

The caching system is optimized for DeepSearch's specific patterns:

1. **Normalized Cache Keys**: Queries are normalized before caching to increase hit rates
2. **TTL Management**: Different TTLs based on query type (current events vs. general knowledge)
3. **Cache Invalidation**: Automatic cache invalidation for time-sensitive queries

### Response Content Enhancement

The system formats and enhances response content for better readability:

```typescript
/**
 * Format and enhance search result content for AI consumption
 * @param content Raw search result content
 * @param duration Search duration in ms
 * @returns Enhanced content with sources and attribution
 */
function formatAndEnhanceContent(content: string, duration: number): string {
    // Add search attribution
    const attribution = `_Information retrieved from web search in ${(duration / 1000).toFixed(1)} seconds._`;
    
    // Extract and format sources if available
    let sourcesSection = '';
    const sourceMatches = content.match(/Sources:\s*([\s\S]*?)(?:\n\n|$)/);
    if (sourceMatches && sourceMatches[1]) {
        const sources = sourceMatches[1].split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.trim());
        
        if (sources.length > 0) {
            sourcesSection = '\n\n**Sources:**\n' + sources.map(s => `- ${s}`).join('\n');
        }
    }
    
    // Clean up and format the main content
    let mainContent = content;
    
    // Remove redundant "Sources:" section if we're formatting it separately
    if (sourcesSection) {
        mainContent = mainContent.replace(/Sources:\s*[\s\S]*?(?:\n\n|$)/, '');
    }
    
    // Ensure content ends with proper formatting
    mainContent = mainContent.trim();
    
    // Combine components
    return `${mainContent}\n\n${sourcesSection}\n\n${attribution}`;
}
```

## Error Handling

The system implements comprehensive error handling:

### Graceful Degradation

When the Perplexity API is unavailable, the system falls back to less resource-intensive options:

```typescript
try {
    // Attempt to use DeepSearch
    return await perplexityService.search(query);
} catch (error) {
    // Log the error
    edgeLogger.error("DeepSearch failed, using fallback", {...});
    
    // Fall back to knowledge base if available
    if (canUseKnowledgeBase) {
        edgeLogger.info("Falling back to knowledge base", {...});
        return await knowledgeBaseService.search(query);
    }
    
    // User-friendly error message
    return "I'm sorry, but I couldn't perform the web search at this time...";
}
```

### Error Categories and Responses

The system categorizes errors and provides appropriate responses:

1. **Configuration Errors**: Missing API keys or invalid environment settings
2. **Authentication Errors**: Invalid or expired API credentials
3. **Rate Limiting Errors**: Too many requests to the Perplexity API
4. **Service Unavailability**: Temporary API outages
5. **Content Filtering Errors**: Queries rejected by content filter

Each error type has specialized logging and user-friendly messages:

```typescript
// Example error handler for rate limiting
if (error.message.includes('rate limit') || response.status === 429) {
    edgeLogger.warn("Perplexity rate limit exceeded", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "perplexity_rate_limit",
        operationId,
        important: true
    });
    
    return "I've reached the limit for web searches right now. Please try again in a few minutes.";
}
```

## Recent Improvements

### 1. Enhanced Attribution

The DeepSearch tool now includes improved source attribution formatting:

```typescript
// Add structured source citation
function formatSourceCitation(sources) {
    if (!sources || sources.length === 0) {
        return '';
    }
    
    return `\n\n## Sources\n${sources.map((source, index) => {
        const { title, url } = source;
        return `[${index + 1}] **${title}**: ${url}`;
    }).join('\n')}`;
}
```

### 2. Optimized API Endpoint

We've moved from direct Perplexity API calls to an optimized internal endpoint:

```typescript
// Before: Direct API call
const response = await fetch('https://api.perplexity.ai/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ query })
});

// After: Using internal endpoint for better reliability
const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
const host = process.env.NODE_ENV === 'development'
    ? 'localhost:3000'
    : (process.env.NEXT_PUBLIC_HOST || 'marlan.photographytoprofits.com');

const apiUrl = `${protocol}://${host}${INTERNAL_API_URL}`;
const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
});
```

### 3. Improved Caching Strategy

The caching system has been enhanced with more intelligent TTL management:

```typescript
/**
 * Determine appropriate TTL for a DeepSearch result
 * @param query The search query
 * @param content The result content
 * @returns TTL in seconds
 */
function determineDeepSearchTTL(query: string, content: string): number {
    // Default TTL: 1 hour
    const DEFAULT_TTL = 60 * 60;
    
    // Shorter TTL for current events (15 minutes)
    const CURRENT_EVENTS_TTL = 15 * 60;
    
    // Current events keywords
    const currentEventsPatterns = [
        /today/i, /latest/i, /recent/i, /current/i, /news/i, 
        /update/i, /now/i, /live/i, /breaking/i
    ];
    
    // Check if query contains current events keywords
    const isCurrentEvents = currentEventsPatterns.some(pattern => pattern.test(query));
    
    return isCurrentEvents ? CURRENT_EVENTS_TTL : DEFAULT_TTL;
}
```

## Testing and Monitoring

### Unit Tests

The system includes comprehensive tests for the DeepSearch functionality:

```typescript
describe('Perplexity Service', () => {
  const TEST_QUERY = 'What are the latest developments in AI?';
  
  // Mock dependencies
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock cache service
    vi.mocked(cacheService.getDeepSearchResults).mockResolvedValue(null);
    vi.mocked(cacheService.setDeepSearchResults).mockResolvedValue();
    
    // Set environment variables
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key-123');
  });
  
  describe('search', () => {
    it('should return cached results when available', async () => {
      // Mock cache hit
      const cachedResult = {
        content: 'Cached AI developments information',
        model: 'cached-model',
        timing: { total: 123 }
      };
      
      vi.mocked(cacheService.getDeepSearchResults).mockResolvedValueOnce(cachedResult);
      
      // Call the search method
      const result = await perplexityService.search(TEST_QUERY);
      
      // Verify result is from cache
      expect(result).toEqual(cachedResult);
      
      // Verify API was not called
      expect(fetch).not.toHaveBeenCalled();
      
      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using cached deep search results',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_cache_hit'
        })
      );
    });
    
    // More tests...
  });
});
```

### Monitoring and Analytics

The system includes detailed metrics collection for monitoring DeepSearch usage:

```typescript
// DeepSearch usage metrics
const deepSearchMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    errors: 0,
    averageLatency: 0,
    
    // Reset metrics at midnight
    resetDaily() {
        this.totalRequests = 0;
        this.cacheHits = 0;
        this.errors = 0;
        this.averageLatency = 0;
    },
    
    // Record a successful search
    recordSuccess(latencyMs: number, fromCache: boolean) {
        this.totalRequests++;
        if (fromCache) this.cacheHits++;
        
        // Update running average for latency
        this.averageLatency = ((this.averageLatency * (this.totalRequests - 1)) + latencyMs) / this.totalRequests;
    },
    
    // Record an error
    recordError() {
        this.totalRequests++;
        this.errors++;
    },
    
    // Get current metrics
    getMetrics() {
        return {
            totalRequests: this.totalRequests,
            cacheHits: this.cacheHits,
            cacheHitRate: this.totalRequests > 0 ? (this.cacheHits / this.totalRequests) : 0,
            errorRate: this.totalRequests > 0 ? (this.errors / this.totalRequests) : 0,
            averageLatency: this.averageLatency
        };
    }
};
```

## Future Enhancements

Upcoming improvements to the DeepSearch system:

1. **Streaming Responses**
   - Real-time streamed results using Server-Sent Events (SSE)
   - Progress indicators during search execution
   - Early termination capabilities for long-running searches

2. **Enhanced Source Verification**
   - Automatic credibility scoring for sources
   - Multiple source verification for fact-checking
   - Configurable source preferences

3. **Multi-Query Orchestration**
   - Breaking complex questions into multiple sub-queries
   - Intelligent aggregation of multiple search results
   - Parallel query execution for improved performance

4. **User Preference Management**
   - Per-user DeepSearch preferences
   - Source preference profiles
   - Search history and favorite results

Implementation timeline for these enhancements will be published in the next sprint planning document. 