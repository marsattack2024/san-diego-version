/**
 * Vector Search Tool for AI SDK
 * 
 * This tool allows the AI to search for relevant documents in the vector database
 * based on the user's query. It integrates with the existing vector search functionality
 * and formats the results for use in the AI's response generation.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { findSimilarDocumentsOptimized } from '@/lib/vector/documentRetrieval';
import { formatDocumentsForLLM, formatDocumentsForDisplay } from '@/lib/vector/formatters';
import { logger } from '@/lib/logger';
import type { RetrievedDocument } from '@/lib/vector/types';

// Type for the vector search tool input
type VectorSearchInput = {
  query: string;
  limit?: number;
  similarityThreshold?: number;
  includeMetadata?: boolean;
  metadataFilter?: Record<string, any>;
  formatOption?: 'llm' | 'display' | 'raw';
};

/**
 * Helper function to create a tool with a name property
 * This bridges the gap between our tool format and AI SDK's tool format
 */
function createTool<T extends z.ZodType, R>(config: {
  name: string;
  description: string;
  schema: T;
  execute: (input: z.infer<T>) => Promise<R>;
}) {
  return {
    name: config.name,
    description: config.description,
    schema: config.schema,
    execute: config.execute,
  };
}

/**
 * Vector search tool for AI SDK
 * 
 * This tool allows the AI to search for relevant documents in the vector database
 * and use them to enhance its responses.
 */
export const vectorSearchTool = tool({
  description: 'Search for relevant documents in the knowledge base based on semantic similarity to the query',
  parameters: z.object({
    query: z.string().min(1, 'Query must not be empty'),
    limit: z.number().min(1).max(20).optional().default(5),
    similarityThreshold: z.number().min(0).max(1).optional().default(0.5),
    includeMetadata: z.boolean().optional().default(true),
    metadataFilter: z.record(z.any()).optional(),
    formatOption: z.enum(['llm', 'display', 'raw']).optional().default('llm'),
  }),
  execute: async (input: VectorSearchInput) => {
    const startTime = Date.now();
    const sessionId = Math.random().toString(36).substring(2, 15);
    
    try {
      logger.info('Vector search tool called', {
        query: input.query,
        limit: input.limit,
        similarityThreshold: input.similarityThreshold,
        sessionId,
      });

      // Find similar documents using the optimized function
      const result = await findSimilarDocumentsOptimized(input.query, {
        limit: input.limit || 5,
        similarityThreshold: input.similarityThreshold || 0.65,
        metadataFilter: input.metadataFilter,
        sessionId,
      });
      
      const documents = result.documents;
      const metrics = result.metrics;

      // Calculate additional metrics
      const retrievalTimeMs = Date.now() - startTime;
      const count = documents.length;
      
      if (count === 0) {
        logger.info('No relevant documents found', { 
          query: input.query, 
          sessionId,
          usedFallbackThreshold: metrics.usedFallbackThreshold || false
        });
        
        return {
          documents: [],
          message: "No relevant documents found in the knowledge base.",
          metrics: {
            count: 0,
            retrievalTimeMs,
            usedFallbackThreshold: metrics.usedFallbackThreshold || false
          }
        };
      }

      // Format documents based on the requested format
      let formattedDocuments: any;
      let formattedContent: string | null = null;
      
      switch (input.formatOption || 'llm') {
        case 'llm':
          formattedContent = formatDocumentsForLLM(documents);
          formattedDocuments = documents.slice(0, 3);
          break;
        case 'display':
          formattedDocuments = formatDocumentsForDisplay(documents);
          break;
        case 'raw':
        default:
          formattedDocuments = documents;
          break;
      }

      logger.info('Vector search completed', {
        query: input.query,
        documentCount: count,
        averageSimilarity: metrics.averageSimilarity,
        retrievalTimeMs,
        usedFallbackThreshold: metrics.usedFallbackThreshold || false,
        isSlowQuery: metrics.isSlowQuery || false,
        sessionId,
      });

      // Return the formatted results
      return {
        documents: formattedDocuments,
        content: formattedContent,
        metrics: {
          ...metrics,
          retrievalTimeMs
        }
      };
    } catch (error) {
      logger.error('Error in vector search tool', {
        error,
        query: input.query,
        sessionId,
      });
      
      throw new Error(`Failed to search vector database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

/**
 * Helper function to extract relevant information from vector search results
 * for inclusion in the AI's response
 */
export function extractRelevantContext(documents: RetrievedDocument[]): string {
  if (!documents || documents.length === 0) {
    return "No relevant information found.";
  }
  
  return formatDocumentsForLLM(documents);
}

/**
 * Creates a system prompt enhancement with retrieved documents
 */
export function createContextEnhancedPrompt(basePrompt: string, documents: RetrievedDocument[]): string {
  if (!documents || documents.length === 0) {
    return basePrompt;
  }
  
  const context = formatDocumentsForLLM(documents);
  
  return `${basePrompt}

Here is some relevant information that may help you provide a more accurate response:

${context}

Please use this information to enhance your response when relevant, but don't explicitly mention that you're using this additional context unless specifically asked about your sources.`;
} 