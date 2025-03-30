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
import { LOG_CATEGORIES, OPERATION_TYPES } from '@/lib/logger/constants';
import { THRESHOLDS } from '@/lib/logger/edge-logger';

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
                const ragOperationId = `rag-${Date.now().toString(36)}`;
                const startTime = Date.now();

                // Log the start of the knowledge base search
                edgeLogger.info('Knowledge base search started', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: OPERATION_TYPES.RAG_SEARCH,
                    operationId: ragOperationId,
                    toolCallId,
                    queryLength: query.length,
                    queryPreview: query.substring(0, 20) + (query.length > 20 ? '...' : '')
                });

                // Use the existing vector search function
                const result = await findSimilarDocumentsOptimized(query, {
                    limit,
                    similarityThreshold,
                    sessionId: toolCallId
                });

                // Duration in milliseconds
                const durationMs = Date.now() - startTime;
                const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
                const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;

                // Process and format results
                if (!result || !result.documents || result.documents.length === 0) {
                    // Log completion with no results
                    edgeLogger.info('Knowledge base search completed with no results', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: OPERATION_TYPES.RAG_SEARCH,
                        operationId: ragOperationId,
                        toolCallId,
                        durationMs,
                        queryLength: query.length,
                        resultsCount: 0,
                        slow: isSlow,
                        important: isImportant,
                        status: 'no_matches',
                        fromCache: result?.metrics?.fromCache || false
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

                // Calculate additional metrics for logging
                const documentIds = documents.map(doc => doc.id || 'unknown').slice(0, 5); // First 5 document IDs
                const topSimilarityScore = documents.length > 0 ? documents[0].similarity || 0 : 0;
                const avgSimilarityScore = documents.length > 0
                    ? documents.reduce((sum, doc) => sum + (doc.similarity || 0), 0) / documents.length
                    : 0;
                const similarityRange = documents.length > 0
                    ? `${(documents[documents.length - 1].similarity || 0).toFixed(3)}-${(documents[0].similarity || 0).toFixed(3)}`
                    : 'n/a';

                // Calculate content length for all results
                const contentLength = documents.reduce((sum, doc) => {
                    const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
                    return sum + content.length;
                }, 0);

                // Extract metadata types
                const metadataTypes = [...new Set(documents
                    .map(doc => doc.metadata?.type || 'unknown'))];

                // Log completion details with enhanced metrics
                if (isSlow) {
                    edgeLogger.warn('Knowledge base search completed', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: OPERATION_TYPES.RAG_SEARCH,
                        operationId: ragOperationId,
                        toolCallId,
                        durationMs,
                        resultsCount: documents.length,
                        documentIds,
                        topSimilarityScore,
                        avgSimilarityScore,
                        similarityRange,
                        contentLength,
                        metadataTypes,
                        fromCache: metrics.fromCache,
                        retrievalTimeMs: metrics.retrievalTimeMs,
                        slow: isSlow,
                        important: isImportant,
                        status: "completed",
                        queryLength: query.length
                    });
                } else {
                    edgeLogger.info('Knowledge base search completed', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: OPERATION_TYPES.RAG_SEARCH,
                        operationId: ragOperationId,
                        toolCallId,
                        durationMs,
                        resultsCount: documents.length,
                        documentIds,
                        topSimilarityScore,
                        avgSimilarityScore,
                        similarityRange,
                        contentLength,
                        metadataTypes,
                        fromCache: metrics.fromCache,
                        retrievalTimeMs: metrics.retrievalTimeMs,
                        slow: isSlow,
                        important: isImportant,
                        status: "completed",
                        queryLength: query.length
                    });
                }

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
                        fromCache: metrics.fromCache,
                        // Include enhanced metrics for potential UI usage
                        topSimilarityScore,
                        avgSimilarityScore,
                        retrievalTimeMs: metrics.retrievalTimeMs
                    }
                };
            } catch (error) {
                // Handle any errors that occur during search
                const errorMessage = error instanceof Error ? error.message : String(error);

                edgeLogger.error('Knowledge base search failed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: OPERATION_TYPES.RAG_SEARCH,
                    toolCallId,
                    queryLength: query.length,
                    queryPreview: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
                    error: errorMessage,
                    important: true
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