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