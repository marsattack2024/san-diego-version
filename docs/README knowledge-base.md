# Knowledge Base Implementation

This document outlines the knowledge base functionality implemented in our application, which provides retrieval-augmented generation (RAG) through vector-based document search.

## Overview

The knowledge base enhances our AI assistant with domain-specific knowledge about photography marketing, business strategies, and industry best practices. Using vector embeddings stored in a Supabase PostgreSQL database with pgvector extension, the system can retrieve relevant documents based on semantic similarity to user queries.

## Architecture

The knowledge base follows a modern RAG architecture with optimized components:

1. **Embeddings Layer**: Converts text to vector representations
2. **Storage Layer**: Manages vector data in Supabase pgvector
3. **Retrieval Layer**: Performs efficient similarity searches
4. **Caching Layer**: Optimizes performance with Redis
5. **Integration Layer**: Connects to the AI assistant via Vercel AI SDK tools

### Component Diagram

```
┌───────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│                   │     │                     │     │                   │
│ Knowledge Base    │────▶│  Vector Search      │────▶│    Supabase       │
│     Tool          │     │     Service         │     │    pgvector       │
│                   │     │                     │     │                   │
└───────────────────┘     └─────────────────────┘     └───────────────────┘
         │                          │                         │
         │                          │                         │
         ▼                          ▼                         ▼
┌───────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│                   │     │                     │     │                   │
│  Result Formatter │     │   Cache Service     │     │  OpenAI Embeddings│
│                   │     │                     │     │                   │
│                   │     │                     │     │                   │
└───────────────────┘     └─────────────────────┘     └───────────────────┘
```

## Core Implementation

### 1. Knowledge Base Tool

The Knowledge Base Tool is defined in `lib/tools/knowledge-base.tool.ts` using the Vercel AI SDK's tool pattern:

```typescript
export const knowledgeBaseTool = tool({
  description: 'Search the knowledge base for information relevant to the query. Use this when you need specific information about photography services, marketing, or business practices.',
  parameters: z.object({
    query: z.string().describe('The search query to find relevant information from the knowledge base')
  }),
  execute: async ({ query }, { toolCallId }) => {
    try {
      // Log the start of the knowledge base search
      edgeLogger.info('Knowledge base search started', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'knowledge_base_search',
        toolCallId,
        query
      });

      const startTime = Date.now();

      // Use the vector search service
      const result = await findSimilarDocumentsOptimized(query, {
        limit: 5,
        sessionId: toolCallId
      });

      const { documents, metrics } = result;

      // Calculate execution time
      const duration = Date.now() - startTime;

      // Log the search results
      edgeLogger.info('Knowledge base search completed', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'knowledge_base_search_complete',
        toolCallId,
        query,
        documentCount: documents.length,
        durationMs: duration,
        fromCache: metrics.fromCache,
      });

      // Format the content for the AI response
      const formattedContent = formatRagResults(documents, query);

      // Return the search results
      return {
        content: formattedContent,
        documents: documents.map(doc => ({
          id: doc.id,
          content: typeof doc.content === 'string' ? doc.content : String(doc.content),
          similarity: doc.similarity || 0
        })),
        meta: {
          count: documents.length,
          fromCache: metrics.fromCache
        }
      };
    } catch (error) {
      // Error handling with detailed logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      edgeLogger.error('Knowledge base search error', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'knowledge_base_search_error',
        toolCallId,
        query,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        content: `Error searching the knowledge base: ${errorMessage}`,
        error: errorMessage,
        documents: []
      };
    }
  }
});
```

### 2. Vector Search Service

The Vector Search Service (`lib/services/vector/document-retrieval.ts`) handles the core RAG functionality:

```typescript
export async function findSimilarDocumentsOptimized(
  query: string,
  options: {
    limit?: number;
    threshold?: number;
    sessionId?: string;
    useCached?: boolean;
  } = {}
): Promise<{
  documents: DocumentWithSimilarity[];
  metrics: {
    totalTimeMs: number;
    embeddingTimeMs: number;
    queryTimeMs: number;
    fromCache: boolean;
  };
}> {
  const {
    limit = 5,
    threshold = 0.7,
    sessionId = 'default',
    useCached = true
  } = options;

  const startTime = Date.now();
  let embeddingTimeMs = 0;
  let queryTimeMs = 0;
  let fromCache = false;

  try {
    // Check cache first if enabled
    if (useCached) {
      const cacheKey = `rag:${query}:${limit}:${threshold}`;
      const cachedResults = await cacheService.getRagResults<DocumentWithSimilarity[]>(cacheKey);
      
      if (cachedResults && Array.isArray(cachedResults)) {
        edgeLogger.info('Using cached RAG results', {
          operation: 'vector_search_cached',
          query,
          resultCount: cachedResults.length,
          sessionId
        });
        
        fromCache = true;
        return {
          documents: cachedResults,
          metrics: {
            totalTimeMs: 0, // From cache, so negligible time
            embeddingTimeMs: 0,
            queryTimeMs: 0,
            fromCache: true
          }
        };
      }
    }

    // Generate embedding for the query
    const embeddingStart = Date.now();
    const embedding = await getEmbedding(query);
    embeddingTimeMs = Date.now() - embeddingStart;

    // Perform vector search in Supabase
    const queryStart = Date.now();
    const { data, error } = await supabaseClient.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit
    });
    queryTimeMs = Date.now() - queryStart;

    if (error) {
      throw new Error(`Error performing vector search: ${error.message}`);
    }

    // Transform results to add similarity scores
    const documents = data.map(item => ({
      id: item.id,
      content: item.content,
      metadata: item.metadata || {},
      similarity: item.similarity
    }));

    // Cache results if any were found
    if (documents.length > 0 && useCached) {
      const cacheKey = `rag:${query}:${limit}:${threshold}`;
      await cacheService.setRagResults(cacheKey, documents);
    }

    return {
      documents,
      metrics: {
        totalTimeMs: Date.now() - startTime,
        embeddingTimeMs,
        queryTimeMs,
        fromCache: false
      }
    };
  } catch (error) {
    // Error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    edgeLogger.error('Vector search error', {
      operation: 'vector_search_error',
      query,
      error: errorMessage,
      sessionId
    });

    throw error;
  }
}
```

### 3. Embedding Service

The Embedding Service (`lib/services/vector/embeddings.ts`) handles text-to-vector conversion:

```typescript
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    // Preprocess text for better embeddings
    const processedText = text.trim().replace(/\n+/g, ' ').slice(0, 8000);

    // Call OpenAI embeddings API
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: processedText,
      encoding_format: "float"
    });

    // Extract embedding vector
    return response.data[0].embedding;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    edgeLogger.error('Embedding generation error', {
      operation: 'get_embedding',
      error: errorMessage,
      textLength: text.length
    });

    throw new Error(`Failed to generate embedding: ${errorMessage}`);
  }
}
```

### 4. Result Formatting

The knowledge base results are formatted for optimal AI consumption:

```typescript
export function formatRagResults(
  documents: DocumentWithSimilarity[],
  originalQuery: string
): string {
  if (!documents || documents.length === 0) {
    return "No relevant information found in the knowledge base.";
  }

  // Sort by similarity (highest first)
  const sortedDocs = [...documents].sort((a, b) => 
    (b.similarity || 0) - (a.similarity || 0)
  );

  // Build formatted response
  let response = `### Knowledge Base Results for: "${originalQuery}"\n\n`;

  // Add each document with its content
  sortedDocs.forEach((doc, index) => {
    // Truncate content if too long (for readability)
    const content = typeof doc.content === 'string' 
      ? doc.content 
      : String(doc.content);
    
    const truncatedContent = content.length > 800 
      ? content.substring(0, 800) + "..." 
      : content;
    
    response += `**Document ${index + 1}** (Similarity: ${(doc.similarity || 0).toFixed(2)})\n${truncatedContent}\n\n`;
  });

  return response;
}
```

## Database Schema

The knowledge base uses the following database schema in Supabase:

```sql
-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  metadata JSONB,
  embedding VECTOR(1536),  -- For text-embedding-3-small
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function for matching documents
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Create index for faster similarity searches
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## Cache Integration

The knowledge base uses Redis caching for performance optimization:

```typescript
// In lib/cache/cache-service.ts
async getRagResults<T>(query: string, options?: any): Promise<T | null> {
  const serializedOptions = options ? JSON.stringify(options) : '';
  const key = this.generateKey(`${query}:${serializedOptions}`, CACHE_NAMESPACES.RAG);
  return this.get<T>(key);
}

async setRagResults<T>(query: string, results: T, options?: any): Promise<void> {
  const serializedOptions = options ? JSON.stringify(options) : '';
  const key = this.generateKey(`${query}:${serializedOptions}`, CACHE_NAMESPACES.RAG);
  return this.set<T>(key, results, { ttl: CACHE_TTL.RAG });
}
```

The TTL for RAG results is defined in `lib/cache/constants.ts`:

```typescript
export const CACHE_TTL = {
  // ...
  RAG: 24 * 60 * 60, // 24 hours for RAG queries
  // ...
};
```

## Content Management

### Document Ingestion

The knowledge base is populated through an admin interface that handles document ingestion:

```typescript
export async function ingestDocument(
  content: string,
  metadata?: Record<string, any>
): Promise<{ id: string; error?: string }> {
  try {
    // Generate embedding for the document
    const embedding = await getEmbedding(content);
    
    // Store in Supabase
    const { data, error } = await supabaseClient
      .from('documents')
      .insert({
        content,
        metadata: metadata || {},
        embedding
      })
      .select('id')
      .single();
    
    if (error) throw new Error(error.message);
    
    return { id: data.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { id: '', error: errorMessage };
  }
}
```

### Document Management

The admin interface includes functionality for managing knowledge base documents:

```typescript
// List documents with pagination
export async function listDocuments(
  page: number = 1,
  pageSize: number = 20
): Promise<{ documents: DocumentRecord[]; total: number }> {
  const start = (page - 1) * pageSize;
  
  const { data, error, count } = await supabaseClient
    .from('documents')
    .select('id, content, metadata, created_at', { count: 'exact' })
    .range(start, start + pageSize - 1)
    .order('created_at', { ascending: false });
  
  if (error) throw new Error(`Error listing documents: ${error.message}`);
  
  return {
    documents: data || [],
    total: count || 0
  };
}

// Delete document
export async function deleteDocument(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseClient
    .from('documents')
    .delete()
    .eq('id', id);
  
  if (error) return { success: false, error: error.message };
  
  return { success: true };
}

// Update document
export async function updateDocument(
  id: string,
  content: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate new embedding if content changed
    const embedding = await getEmbedding(content);
    
    const { error } = await supabaseClient
      .from('documents')
      .update({
        content,
        metadata: metadata || {},
        embedding,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw new Error(error.message);
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
```

## Prompt Integration

The system prompts include instructions for using the knowledge base:

```typescript
// In lib/chat-engine/prompts/index.ts
export function buildSystemPrompt(agentType: AgentType, useDeepSearch = false): string {
  // Get the base prompt for the specific agent type
  const basePrompt = getBasePromptForAgent(agentType);
  
  // Add tool instructions
  const withToolInstructions = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following tools:\n` +
    `- Knowledge Base (getInformation): Retrieve information from our internal knowledge base about photography marketing, business strategies, and industry best practices. Use this as your primary source for photography-specific information.\n` +
    // Other tools...
    
  // Add knowledge base usage instructions
  const kbInstructions = `\n### KNOWLEDGE BASE USAGE:\n\n` +
    `When using the knowledge base tool:\n` +
    `1. Use specific, clear queries for better results\n` +
    `2. Prefer the knowledge base over your general knowledge for photography-specific information\n` +
    `3. Directly incorporate knowledge base information into your responses\n` +
    `4. Cite the knowledge base as your source when using information from it\n`;
  
  return `${withToolInstructions}${kbInstructions}`;
}
```

## Error Handling and Fallbacks

The knowledge base implementation includes comprehensive error handling:

```typescript
try {
  // Knowledge base search implementation
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Detailed error logging
  edgeLogger.error('Knowledge base search error', {
    category: LOG_CATEGORIES.TOOLS,
    operation: 'knowledge_base_search_error',
    toolCallId,
    query,
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined
  });

  // In-memory fallback for critical failures
  if (inMemoryKnowledgeBase && inMemoryKnowledgeBase.length > 0) {
    edgeLogger.info('Using in-memory fallback for knowledge base', {
      category: LOG_CATEGORIES.TOOLS,
      operation: 'knowledge_base_fallback',
      toolCallId
    });
    
    // Perform simple keyword matching as fallback
    const results = performSimpleKeywordMatch(query, inMemoryKnowledgeBase);
    return {
      content: formatRagResults(results, query),
      documents: results,
      meta: { count: results.length, fromFallback: true }
    };
  }

  // User-friendly error message
  return {
    content: `Error searching the knowledge base: ${errorMessage}`,
    error: errorMessage,
    documents: []
  };
}
```

## Monitoring and Analytics

The implementation includes detailed logging for monitoring and analytics:

```typescript
// Log knowledge base search start
edgeLogger.info('Knowledge base search started', {
  category: LOG_CATEGORIES.TOOLS,
  operation: 'knowledge_base_search',
  toolCallId,
  query
});

// Log cache hits
if (cachedResults && Array.isArray(cachedResults)) {
  edgeLogger.info('Using cached RAG results', {
    operation: 'vector_search_cached',
    query,
    resultCount: cachedResults.length,
    sessionId: toolCallId
  });
  
  fromCache = true;
  return {
    documents: cachedResults,
    metrics: {
      totalTimeMs: 0,
      embeddingTimeMs: 0,
      queryTimeMs: 0,
      fromCache: true
    }
  };
}

// Log search completion
edgeLogger.info('Knowledge base search completed', {
  category: LOG_CATEGORIES.TOOLS,
  operation: 'knowledge_base_search_complete',
  toolCallId,
  query,
  documentCount: documents.length,
  durationMs: duration,
  fromCache: metrics.fromCache,
});
```

## Performance Optimization Techniques

The knowledge base uses several techniques to optimize performance:

1. **Redis Caching**: Results are cached to avoid repeated searches for common queries
2. **Vector Indexing**: The pgvector index accelerates similarity searches
3. **Embedding Reuse**: Embeddings are generated once and stored for future use
4. **Result Limiting**: Only the most relevant documents are returned
5. **Query Preprocessing**: Queries are cleaned and optimized before embedding
6. **Similarity Threshold**: Documents below a similarity threshold are excluded
7. **In-Memory Fallback**: Critical failures can use a simple keyword matching fallback

## Usage Patterns

### When to Use the Knowledge Base

The AI is instructed to use the knowledge base in these scenarios:

1. **Domain-Specific Questions**: For photography marketing or business questions
2. **Specific Techniques**: When asked about specific photography techniques or strategies
3. **Industry Best Practices**: For questions about industry standards or best practices
4. **Pricing Strategies**: When asked about pricing or business models for photographers
5. **Marketing Templates**: When creating marketing materials or templates

### How the Knowledge Base Is Used in Conversations

1. The user asks a question related to photography marketing
2. The agent identifies that the knowledge base might have relevant information
3. The agent queries the knowledge base with a well-formed search query
4. The knowledge base returns the most relevant documents
5. The agent incorporates this information into its response
6. The agent cites the knowledge base as the source of this information

## Benefits

1. **Domain Expertise**: Provides specialized knowledge about photography marketing
2. **Content Control**: Allows the business to control the information provided
3. **Semantic Search**: Uses meaning-based search rather than keyword matching
4. **Scalability**: Easily expandable with new documents
5. **Performance**: Optimized for quick responses through caching
6. **Reliability**: Includes fallbacks for robustness

## Configuration Options

### Environment Variables

```
# Required for knowledge base functionality
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional configuration
EMBEDDING_MODEL=text-embedding-3-small  # Default embedding model
KNOWLEDGE_BASE_SIMILARITY_THRESHOLD=0.7  # Minimum similarity score (0-1)
KNOWLEDGE_BASE_RESULT_LIMIT=5  # Maximum number of results to return
```

### Feature Flags

```typescript
// In tool options
useKnowledgeBase: boolean  // Controls whether the KB tool is included

// In search options
{
  limit?: number;          // Maximum number of results
  threshold?: number;      // Minimum similarity threshold
  useCached?: boolean;     // Whether to use cached results
}
```

## References

- [OpenAI Embeddings Documentation](https://platform.openai.com/docs/guides/embeddings)
- [Supabase pgvector Documentation](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Vercel AI SDK Tool Documentation](https://sdk.vercel.ai/docs/getting-started/tools)
- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/)
- [RAG Architecture Guide](https://www.pinecone.io/learn/retrieval-augmented-generation/) 

# RAG with Permissions

## Overview

This document outlines our implementation of Retrieval Augmented Generation (RAG) using Supabase's pgvector with fine-grained access control. Our system combines vector similarity search with row-level security (RLS) to ensure secure and efficient document retrieval.

## Core Implementation

### Database Schema

```sql
-- Track documents/pages/files/etc
create table documents (
  id bigint primary key generated always as identity,
  name text not null,
  owner_id uuid not null references auth.users (id) default auth.uid(),
  created_at timestamp with time zone not null default now()
);

-- Store the content and embedding vector for each section
create table document_sections (
  id bigint primary key generated always as identity,
  document_id bigint not null references documents (id),
  content text not null,
  embedding vector (384)
);
```

### Security Policies

```sql
-- Enable row level security
alter table document_sections enable row level security;

-- Setup RLS for select operations
create policy "Users can query their own document sections"
on document_sections for select to authenticated using (
  document_id in (
    select id
    from documents
    where (owner_id = (select auth.uid()))
  )
);
```

## Our RAG Implementation

### Caching Layer

```typescript
const CACHE_CONFIG = {
  maxSize: 100,          // Maximum cache entries
  ttl: 15 * 60 * 1000,  // 15-minute TTL
  similarityThreshold: 0.92, // Semantic deduplication threshold
  warmupInterval: 5 * 60 * 1000 // 5-minute warmup interval
};

interface CacheEntry {
  documents: RetrievedDocument[];
  metrics: DocumentSearchMetrics;
  timestamp: number;
  embedding?: number[];
  accessCount: number;
}
```

### Vector Search Function

```typescript
export async function findSimilarDocumentsOptimized(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  const sessionId = options.sessionId || Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();
  
  // Check cache first
  const cacheKey = hashQueryOptions(queryText, options);
  const cachedResult = vectorSearchCache.get(cacheKey);
  
  if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_CONFIG.ttl)) {
    return {
      documents: cachedResult.documents,
      metrics: {
        ...cachedResult.metrics,
        fromCache: true
      }
    };
  }
  
  // Perform vector search
  const documents = await findSimilarDocuments(queryText, options);
  
  // Calculate metrics
  const metrics = calculateSearchMetrics(documents);
  
  // Cache results
  vectorSearchCache.set(cacheKey, {
    documents,
    metrics,
    timestamp: Date.now(),
    accessCount: 1
  });
  
  return { documents, metrics };
}
```

### Performance Monitoring

```typescript
interface DocumentSearchMetrics {
  count: number;
  averageSimilarity: number;
  highestSimilarity: number;
  lowestSimilarity: number;
  retrievalTimeMs: number;
  isSlowQuery: boolean;
  usedFallbackThreshold?: boolean;
  fromCache?: boolean;
  semanticMatch?: boolean;
}
```

## Integration with AI Chat

1. **RAG Tool Registration**
```typescript
const getInformation = tool({
  description: 'Search the internal knowledge base',
  parameters: getInformationSchema,
  execute: async ({ query }) => {
    const result = await findSimilarDocumentsOptimized(query);
    return formatDocumentsForAI(result.documents);
  }
});
```

2. **Priority in Chat Pipeline**
- RAG is the highest priority knowledge source
- Executed before web scraping and deep search
- Results are cached for 15 minutes

3. **Content Processing**
- Semantic deduplication of similar results
- Automatic query preprocessing
- Cache warming for frequent queries

## Performance Optimizations

1. **Query Preprocessing**
```typescript
function preprocessQuery(query: string): string {
  // Remove filler words for better matches
  const processed = query.toLowerCase();
  const fillerWords = ['the', 'a', 'an', ...];
  return processed.split(' ')
    .filter(word => !fillerWords.includes(word))
    .join(' ');
}
```

2. **Cache Management**
- LRU cache eviction
- Semantic similarity checks
- Automatic cache warming
- Access count tracking

3. **Error Recovery**
- Fallback similarity thresholds
- Automatic retries
- Error logging and monitoring

## Monitoring and Logging

1. **Performance Metrics**
- Query execution time
- Cache hit/miss rates
- Document count and similarity scores
- Slow query detection

2. **Error Tracking**
- Failed queries
- Cache issues
- Vector search errors
- Authentication failures

## Best Practices

1. **Query Optimization**
- Use precise search terms
- Include relevant context
- Limit result count appropriately
- Monitor similarity scores

2. **Cache Management**
- Regular cache warmup
- Monitor cache hit rates
- Adjust TTL based on usage
- Track popular queries

3. **Error Handling**
- Implement proper fallbacks
- Log all errors with context
- Monitor error patterns
- Regular performance reviews

## Configuration

1. **Cache Settings**
```typescript
const CACHE_CONFIG = {
  maxSize: 100,
  ttl: 15 * 60 * 1000,
  similarityThreshold: 0.92,
  warmupInterval: 5 * 60 * 1000
};
```

2. **Vector Search**
```typescript
const VECTOR_CONFIG = {
  initialThreshold: 0.6,
  minimumThreshold: 0.4,
  maxRetries: 3
};
```

3. **Performance Thresholds**
```typescript
const PERFORMANCE_CONFIG = {
  slowQueryThreshold: 500, // ms
  maxContentSize: 50000,   // characters
  maxResults: 10
};
```

## Testing

1. **Unit Tests**
- Vector search functionality
- Cache operations
- Query preprocessing
- Error handling

2. **Integration Tests**
- End-to-end RAG pipeline
- Cache warming
- Error recovery
- Performance monitoring

## Future Improvements

1. **Enhanced Caching**
- Distributed cache support
- Predictive cache warming
- Query result aggregation
- Cache analytics

2. **Query Optimization**
- Dynamic similarity thresholds
- Query intent detection
- Result ranking improvements
- Context-aware search

3. **Monitoring**
- Real-time performance dashboards
- Error pattern detection
- Usage analytics
- Cache efficiency metrics

## Widget Implementation Notes

The widget chat implementation uses the same RAG system as the main chat interface but handles sessions differently:

1. **Anonymous Sessions:** Widget sessions are anonymous by default without requiring authentication
2. **Simplified Persistence:** Message persistence is disabled for anonymous sessions
3. **Identical RAG Performance:** The same Redis caching is used for all RAG operations
4. **Logging Differences:** Tool usage is logged at the RAG operation level but not at the message persistence level
5. **Cache Effectiveness:** Both implementations benefit from the cached results, visible in reduced latency for repeated queries

### Technical Implementation Details

The widget chat implementation in `app/api/widget-chat/route.ts` configures the chat engine with:

```typescript
const chatEngine = await createChatEngine({
  tools: widgetTools,  // Uses the standard tools registry with widget-specific configuration
  messages,
  requiresAuth: false, // Key difference: No authentication requirement
  cacheEnabled: true,  // Same caching functionality as main chat
  sessionId: sessionId || `widget-${crypto.randomUUID()}`,
  // Message persistence and history are disabled for anonymous users
  saveChatHistory: false 
});
```

This configuration ensures that the widget uses the same underlying RAG functionality but skips message persistence, which affects tool usage logging.

### Core Flow Comparison

**Main Chat Flow (Authenticated):**
1. User sends query → Route handler processes request
2. Chat engine creates with `tools: fullChatTools, requiresAuth: true`  
3. Knowledge base tool executes and searches for documents
4. Document retrieval checks cache → returns documents
5. Tool usage is logged in `onToolCall` and message is saved with tool usage metadata
6. Tool results appear in logs with operation IDs and metrics

**Widget Chat Flow (Anonymous):**
1. User sends query → Widget route handler processes request  
2. Chat engine creates with `tools: widgetTools, requiresAuth: false, saveChatHistory: false`
3. Knowledge base tool executes and searches for documents (identical to main chat)
4. Document retrieval checks cache → returns documents (identical to main chat)
5. Tool usage is logged in `onToolCall` but message persistence is skipped
6. No tool usage appears in message persistence logs, but RAG operations are fully logged

### Troubleshooting RAG in Widget

When verifying RAG functionality in the widget implementation:

1. **Check Operation Logs:** Look for these log patterns:
   ```
   Knowledge base search started (tools)
   RAG operation with cache check (tools)
   Using cached RAG results (tools) [if applicable]
   Knowledge base search completed (tools)
   ```

2. **Monitor Cache Performance:** The cacheService logs cache hits/misses for both implementations:
   ```
   Cache stats (system)
     hits=45
     misses=23
     hitRate=0.66
   ```

3. **Verify Document Similarity:** Both implementations return similarity scores:
   ```
   Knowledge base search completed (tools)
     topSimilarityScore=0.88
     documentCount=3
   ```

4. **Missing Message Logs:** The following log indicates why tool usage isn't in message persistence:
   ```
   Skipping assistant message persistence (chat)
     disabled=false
     hasUserId=false
   ```

### Implementation Advantages

This implementation approach provides several benefits:

1. **Shared Code Path:** Both widget and main chat use the same core RAG implementation
2. **Consistent Caching:** All RAG operations benefit from the shared Redis cache
3. **Simplified Authentication:** Widget users don't need authentication for basic RAG
4. **Performance:** Skipping message persistence reduces database load for anonymous sessions
5. **Minimal Maintenance:** Updates to the RAG system automatically benefit both implementations