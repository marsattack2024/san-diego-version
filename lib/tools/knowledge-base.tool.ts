/**
 * Knowledge Base Tool
 * 
 * This module provides a tool for retrieving relevant knowledge base documents
 * based on a user query. It leverages the existing vector search functionality
 * and is designed to be used with the Vercel AI SDK's tools framework.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { findSimilarDocumentsOptimized } from '@/lib/services/vector/document-retrieval';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Define tool parameters schema using Zod
const knowledgeBaseSchema = z.object({
    query: z.string().describe('The search query to find relevant information from the knowledge base')
});

// Type for tool options
export interface KnowledgeBaseToolOptions {
    limit?: number;
    similarityThreshold?: number;
    operationName?: string;
}

/**
 * Creates a knowledge base tool with the specified options
 * Can be used in both chat implementations with consistent behavior
 * @param options - Configuration options for the knowledge base tool
 * @returns A configured knowledge base tool ready to be used with AI SDK
 */
export function createKnowledgeBaseTool(options: KnowledgeBaseToolOptions = {}) {
    const {
        limit = 5,
        similarityThreshold = 0.7,
        operationName = 'knowledge_base_search'
    } = options;

    return tool({
        description: 'Search the knowledge base for information relevant to the query. Use this when you need specific information about photography services, marketing, or business practices.',
        parameters: knowledgeBaseSchema,
        execute: async ({ query }, { toolCallId }) => {
            try {
                // Log the start of the knowledge base search
                edgeLogger.info('Knowledge base search started', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    query
                });

                const startTime = Date.now();

                // Use the existing vector search function
                const result = await findSimilarDocumentsOptimized(query, {
                    limit,
                    similarityThreshold,
                    sessionId: toolCallId
                });

                // Duration in milliseconds
                const durationMs = Date.now() - startTime;

                // Process and format results
                if (!result || !result.documents || result.documents.length === 0) {
                    edgeLogger.info('Knowledge base search completed with no results', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: operationName,
                        toolCallId,
                        durationMs,
                        query
                    });

                    return {
                        content: "No relevant information found in the knowledge base for your query.",
                        documents: []
                    };
                }

                // Get metrics for logging
                const { metrics, documents } = result;

                // Format documents into a readable text format
                const formattedContent = documents
                    .map((doc, index) => {
                        // Convert content to string if it's not already
                        const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
                        // Format with document index and metadata if available
                        const similarity = doc.similarity || 0; // Default to 0 if undefined
                        return `Document ${index + 1} [Similarity: ${similarity.toFixed(2)}]:\n${content}\n`;
                    })
                    .join('\n---\n\n');

                // Log completion details
                edgeLogger.info('Knowledge base search completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    documentCount: documents.length,
                    averageSimilarity: metrics.averageSimilarity,
                    fromCache: metrics.fromCache,
                    retrievalTimeMs: metrics.retrievalTimeMs,
                    totalDurationMs: durationMs,
                    query
                });

                // Return formatted results
                return {
                    content: formattedContent,
                    documents: documents.map(doc => ({
                        id: doc.id,
                        content: typeof doc.content === 'string' ? doc.content : String(doc.content),
                        similarity: doc.similarity || 0 // Default to 0 if undefined
                    })),
                    meta: {
                        count: documents.length,
                        fromCache: metrics.fromCache
                    }
                };
            } catch (error) {
                // Handle any errors that occur during search
                const errorMessage = error instanceof Error ? error.message : String(error);

                edgeLogger.error('Knowledge base search failed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    query,
                    error: errorMessage
                });

                // Return error information
                return {
                    content: `Error searching the knowledge base: ${errorMessage}`,
                    error: errorMessage,
                    documents: []
                };
            }
        }
    });
}

/**
 * Default knowledge base tool instance with standard configuration
 * Ready to use in both chat implementations
 */
export const knowledgeBaseTool = createKnowledgeBaseTool(); 