# Vector Search and RAG System Documentation

## Overview

This document provides a comprehensive explanation of our Retrieval-Augmented Generation (RAG) system, which enhances AI responses by retrieving relevant documents from a knowledge base. The system uses vector embeddings to find semantically similar documents to user queries and integrates this information into the response generation process.

> **IMPORTANT NOTES**:
> 1. Only administrators can upload documents. End users cannot upload documents or attachments.
> 2. Document management is restricted through Row Level Security policies in the database.
> 3. The RAG system implements an adaptive threshold mechanism (0.6 initial, 0.4 fallback) directly in the database.

## Table of Contents

1. [Vector Embeddings](#vector-embeddings)
2. [Document Storage and Retrieval](#document-storage-and-retrieval)
3. [Retrieval Process](#retrieval-process)
4. [Document Formatting](#document-formatting)
5. [Tools Integration](#tools-integration)
6. [Agent Routing](#agent-routing)
7. [Performance Monitoring](#performance-monitoring)
8. [Troubleshooting](#troubleshooting)

## Vector Embeddings

### What Are Vector Embeddings?

Vector embeddings are numerical representations of text in a high-dimensional space. In this space, semantically similar texts are positioned closer together, allowing for similarity-based retrieval. Our system uses OpenAI's embedding models to convert text into these vector representations.

### Embedding Creation Process

1. **Text Preprocessing**: Before embedding, text is preprocessed to normalize and clean it.
2. **Embedding Generation**: The preprocessed text is sent to the embedding model, which returns a vector (typically 1536 dimensions for OpenAI's models).
3. **Storage**: The resulting vector is stored in a Supabase database with pgvector extension, which enables efficient similarity searches.

### Implementation Details

The embedding creation is handled in `lib/vector/embeddings.ts`, which provides functions to:
- Create embeddings for single texts
- Create embeddings for batches of texts
- Handle error cases and retries

## Document Storage and Retrieval

### Database Schema

Documents are stored in a single table called `documents` with the following structure:
- `id`: Unique identifier (UUID)
- `title`: Document title
- `content`: The full text content
- `kind`: Document type/category
- `user_id`: ID of the admin user who uploaded the document
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update
- `embedding`: Vector representation (1536 dimensions)

> **IMPORTANT**: Only administrators can upload documents. End users cannot upload documents or attachments. The database enforces this through Row Level Security (RLS) policies that restrict document creation/modification to admin users only.

### Retrieval Process

Document retrieval is implemented in `lib/vector/documentRetrieval.ts` with three key functions:

1. **`findSimilarDocuments`**: Basic function that performs a vector similarity search.
   ```typescript
   async function findSimilarDocuments(
     queryText: string,
     options: DocumentSearchOptions = {}
   ): Promise<RetrievedDocument[]>
   ```

2. **`findSimilarDocumentsWithPerformance`**: Extends the basic function with performance monitoring.
   ```typescript
   export async function findSimilarDocumentsWithPerformance(
     queryText: string,
     options: DocumentSearchOptions = {}
   ): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }>
   ```

3. **`findSimilarDocumentsOptimized`**: The main entry point that implements:
   - Query preprocessing
   - Automatic fallback to lower similarity thresholds
   - Performance monitoring
   - Detailed logging
   ```typescript
   export async function findSimilarDocumentsOptimized(
     queryText: string,
     options: DocumentSearchOptions = {}
   ): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }>
   ```

### Configuration Options

The retrieval process accepts several configuration options:

- **`limit`**: Maximum number of documents to retrieve (default: 5)
- **`similarityThreshold`**: *Deprecated* - Thresholds are now handled directly in the database function (0.6 initial, 0.4 fallback)
- **`metadataFilter`**: Filter documents based on metadata fields
- **`sessionId`**: Identifier for tracking and logging

### Adaptive Threshold Mechanism

The system implements an adaptive threshold mechanism directly in the database function:

1. **Initial Threshold (0.6)**: First attempts to find documents with at least 60% similarity
2. **Fallback Threshold (0.4)**: If no documents meet the initial threshold, automatically falls back to a lower threshold of 40%

This two-tier approach ensures that:
- High quality matches are prioritized (documents with 60%+ similarity)
- If no high-quality matches exist, potentially relevant documents with at least 40% similarity are returned
- Completely irrelevant documents (below 40% similarity) are filtered out entirely

The thresholds are implemented within the `match_documents` SQL function for optimal performance and to reduce database roundtrips.

## Retrieval Process

The complete retrieval process follows these steps:

1. **Query Preprocessing**: The user query is preprocessed to improve match quality.
   ```typescript
   function preprocessQuery(query: string): string
   ```

2. **Embedding Creation**: The preprocessed query is converted to a vector embedding.

3. **Database Search**: The query embedding is sent to the `match_documents` database function, which:
   - First attempts to find documents with similarity ≥ 0.6
   - If no results are found, automatically falls back to documents with similarity ≥ 0.4
   - All filtering happens in a single database call

5. **Document Filtering**: The top 5 documents are retrieved based on similarity scores.

6. **Agent Presentation**: Only the top 3 most relevant documents are presented to the agent.

## Document Formatting

Retrieved documents are formatted for different use cases through functions in `lib/vector/formatters.ts`:

1. **`formatDocumentsForLLM`**: Formats documents for inclusion in AI prompts.
   ```typescript
   export function formatDocumentsForLLM(documents: RetrievedDocument[]): string
   ```
   - Only uses the top 3 most relevant documents
   - Includes similarity percentages
   - Formats content with clear document boundaries
   - Applies proper indentation and line breaks for readability
   - Adds separators between documents

2. **`formatDocumentsForDisplay`**: Formats documents for UI display.
   ```typescript
   export function formatDocumentsForDisplay(documents: RetrievedDocument[]): {
     id: string;
     title: string;
     content: string;
     preview: string;
     similarity: number;
     similarityPercent: number;
     metadata?: Record<string, any>;
   }[]
   ```

3. **`formatDocumentsAsMarkdown`**: Formats documents as markdown for display in markdown-compatible contexts.
   ```typescript
   export function formatDocumentsAsMarkdown(documents: RetrievedDocument[]): string
   ```

4. **`createRAGPrompt`**: Creates a complete prompt with retrieved documents for RAG.
   ```typescript
   export function createRAGPrompt(query: string, documents: RetrievedDocument[]): string
   ```

### Formatting Improvements

The system includes several formatting improvements to enhance readability:

1. **Indented Content**: Document content is indented with four spaces for better readability.
2. **Line Break Handling**: Line breaks in the original content are preserved and properly formatted.
3. **Document Separators**: Clear separators are added between documents to visually distinguish them.
4. **Metadata Formatting**: Metadata is formatted with proper indentation and structure.
5. **Log Formatting**: Vector search logs are formatted to be more readable, with clean previews and organized structure.

## Tools Integration

The RAG system is integrated with the agent through tools defined in `lib/chat/tools.ts` and `lib/agents/tools/vector-search-tool.ts`.

### getInformation Tool

The primary tool for knowledge retrieval is `getInformation`:

```typescript
getInformation: tool({
  description: 'Search the knowledge base before answering any question',
  parameters: z.object({
    query: z.string().describe('the question to search for')
  }),
  execute: async ({ query }): Promise<string> => {
    try {
      // Note: similarityThreshold is no longer needed - handled by database
      const { documents, metrics } = await findSimilarDocumentsOptimized(query, {
        limit: 5
      });
      
      if (!documents || documents.length === 0) {
        return "No relevant information found in the knowledge base.";
      }

      // Only use the top 3 most relevant documents for the agent
      const topDocuments = documents.slice(0, 3);
      
      // Format the results with more detail including IDs and similarity scores
      const formattedResults = topDocuments.map((doc: RetrievedDocument, index: number) => {
        const similarityPercent = Math.round(doc.similarity * 100);
        const idString = typeof doc.id === 'string' ? doc.id : String(doc.id);
        const idPreview = idString.length > 8 ? idString.substring(0, 8) : idString;
        
        return `Document #${index + 1} [ID: ${idPreview}] (${similarityPercent}% relevant):\n${doc.content}\n`;
      }).join('\n');

      // Add aggregate metrics
      const avgSimilarity = Math.round(
        topDocuments.reduce((sum, doc) => sum + doc.similarity, 0) / topDocuments.length * 100
      );

      // Log if fallback threshold was used
      const thresholdInfo = metrics.usedFallbackThreshold 
        ? " (fallback threshold was used)" 
        : "";

      return `Found ${topDocuments.length} most relevant documents (out of ${documents.length} retrieved, average similarity of top 3: ${avgSimilarity}%${thresholdInfo}):\n\n${formattedResults}`;
    } catch (error) {
      // Error handling...
    }
  }
})
```

### vectorSearchTool

A more flexible tool for vector search is `vectorSearchTool`, which supports different formatting options:

```typescript
export const vectorSearchTool = tool({
  name: 'vectorSearch',
  description: 'Search the knowledge base for relevant information',
  schema: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().describe('Maximum number of results to return'),
    // similarityThreshold is no longer needed as it's handled in the database
    formatOption: z.enum(['llm', 'display', 'raw']).optional().describe('Format option for results')
  }),
  execute: async (input: VectorSearchInput) => {
    // Implementation uses database thresholds (0.6 initial, 0.4 fallback)
  }
})
```

## Agent Routing

The RAG system is integrated into the agent routing process in `app/api/chat/route.ts`:

1. **Query Processing**: When a user sends a query, the system first checks if RAG should be applied.

2. **RAG Execution**: If applicable, the system retrieves relevant documents using `findSimilarDocumentsOptimized`.

3. **System Prompt Enhancement**: Retrieved documents are added to the system prompt to provide context for the AI.

4. **Tool Results Tracking**: The system tracks which tools were used (RAG, web scraper, deep search) and includes this information in the system prompt.

5. **Response Generation**: The AI generates a response based on the enhanced system prompt.

## Performance Monitoring

The system includes comprehensive performance monitoring:

1. **Query Timing**: Each query's execution time is measured and logged.

2. **Slow Query Detection**: Queries taking longer than a threshold (e.g., 500ms) are flagged as slow.

3. **Similarity Metrics**: For each search, the system tracks:
   - Average similarity
   - Highest similarity
   - Lowest similarity
   - Number of results

4. **Fallback Detection**: The system detects and logs when the fallback threshold was used by analyzing the similarity scores of returned documents.

## Troubleshooting

### Common Issues

1. **No Results Found**: 
   - If no results are found even with the 0.4 fallback threshold, the documents may be too dissimilar
   - Verify that the query is preprocessed correctly
   - Ensure the embeddings are created properly

2. **Slow Queries**:
   - Check the database index on the embedding column
   - Consider optimizing the query preprocessing
   - Review the number of documents in the database

3. **Irrelevant Results**:
   - The two-tier threshold system (0.6/0.4) should filter out irrelevant results
   - If still getting irrelevant results, improve the query preprocessing
   - Consider retraining or updating the embeddings
   - Admin can modify the thresholds in the SQL function if needed

### Debugging Tools

1. **Vector Logger**: Use `lib/logger/vector-logger.ts` to log detailed information about vector operations.

2. **Edge Logger**: Use `lib/logger/edge-logger.ts` for general logging in edge functions.

3. **Metrics Visualization**: Review the metrics returned by `findSimilarDocumentsOptimized` to understand search performance.

## Database Schema Details

### Table Relationships

The database schema consists of the following key tables:

1. **auth.users** (Supabase provided)
   - Contains user authentication information
   - Referenced by other tables via `user_id` foreign keys

2. **sd_chat_sessions**
   - Stores chat session information
   - Primary key: `id` (UUID, auto-generated)
   - Foreign key: `user_id` references `auth.users(id)`
   - Creates timestamps (`created_at`, `updated_at`) automatically

3. **sd_chat_histories**
   - Stores individual chat messages within sessions
   - Primary key: `id` (UUID, auto-generated)
   - Foreign key: `session_id` references `sd_chat_sessions(id)`
   - Foreign key: `user_id` references `auth.users(id)`
   - Creates timestamps (`created_at`) automatically
   - Includes `vote` column for user feedback (up/down/null)
   - Contains `tools_used` to track which tools were used in generating the response

4. **documents**
   - Stores document content with vector embeddings
   - Primary key: `id` (UUID, auto-generated)
   - Foreign key: `user_id` references `auth.users(id)`
   - Only admin users can create/modify/delete documents (enforced by RLS)
   - All users can view documents

### Component Responsibilities

- **Database**: Generates all IDs and timestamps automatically
- **Server**: Validates data and enforces application logic
- **Client**: Maintains user context and manages session state

## Conclusion

This RAG system provides a robust mechanism for enhancing AI responses with relevant information from a knowledge base. By using vector embeddings and similarity search, it can find semantically relevant documents even when exact keyword matches are not present. The system's configurable parameters, fallback mechanisms, and comprehensive logging make it adaptable to various use cases and easy to troubleshoot. 

The database schema is designed with proper normalization, referential integrity, and security in mind, ensuring that only administrators can manage documents while allowing all users to benefit from the RAG capabilities.
