/**
 * RAG Tool
 * 
 * This module provides a tool for retrieving and processing RAG context
 * following the Vercel AI SDK's tool pattern.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { findSimilarDocumentsOptimized } from '@/lib/vector/documentRetrieval';

// Define tool parameters schema using Zod
const ragToolSchema = z.object({
    query: z.string().describe('The search query to find relevant information from the knowledge base'),
    enhanceWithWebContent: z.boolean().optional().describe('Whether to enhance results with web content if available')
});

// Type for tool options
export interface RAGToolOptions {
    limit?: number;
    similarityThreshold?: number;
    maxContextLength?: number;
    operationName?: string;
}

/**
 * Creates a RAG tool with specified options
 * Following the Vercel AI SDK tool pattern
 * @param options - Configuration options for the RAG tool
 * @returns A configured RAG tool ready to be used with AI SDK
 */
export function createRAGTool(options: RAGToolOptions = {}) {
    const {
        limit = 5,
        similarityThreshold = 0.7,
        maxContextLength = 4000,
        operationName = 'rag_tool'
    } = options;

    return tool({
        description: 'Retrieve relevant context from the knowledge base to help answer the query. Use this whenever you need specific information that may be in the system.',
        parameters: ragToolSchema,
        execute: async ({ query, enhanceWithWebContent = false }, { toolCallId }) => {
            try {
                // Log the start of the RAG process
                edgeLogger.info('RAG tool execution started', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    query
                });

                const startTime = Date.now();

                // Use the vector search function to find relevant documents
                const result = await findSimilarDocumentsOptimized(query, {
                    limit,
                    similarityThreshold,
                    sessionId: toolCallId
                });

                // Process and format results
                if (!result || !result.documents || result.documents.length === 0) {
                    edgeLogger.info('RAG search completed with no results', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: operationName,
                        toolCallId,
                        durationMs: Date.now() - startTime,
                        query
                    });

                    return {
                        content: "No relevant information found in the knowledge base for your query.",
                        documents: []
                    };
                }

                // Get documents and metrics for processing
                const { metrics, documents } = result;

                // Format the context directly following the Vercel AI SDK pattern
                const formattedContent = documents
                    .map((doc, index) => {
                        const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
                        const similarity = doc.similarity || 0;
                        return `### Document ${index + 1} [Similarity: ${similarity.toFixed(2)}]\n\n${content}`;
                    })
                    .join('\n\n---\n\n');

                // Log completion details
                edgeLogger.info('RAG tool execution completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    documentCount: documents.length,
                    averageSimilarity: metrics.averageSimilarity,
                    fromCache: metrics.fromCache,
                    retrievalTimeMs: metrics.retrievalTimeMs,
                    contextLength: formattedContent.length,
                    totalDurationMs: Date.now() - startTime,
                    query
                });

                // Return the formatted context that follows the Vercel AI SDK pattern
                return {
                    content: formattedContent,
                    meta: {
                        count: documents.length,
                        fromCache: metrics.fromCache,
                        retrievalTimeMs: metrics.retrievalTimeMs,
                        averageSimilarity: metrics.averageSimilarity
                    }
                };
            } catch (error) {
                // Handle any errors that occur during search
                const errorMessage = error instanceof Error ? error.message : String(error);

                edgeLogger.error('RAG tool execution failed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    query,
                    error: errorMessage
                });

                // Return error information
                return {
                    content: `Error retrieving context: ${errorMessage}`,
                    error: errorMessage
                };
            }
        }
    });
}

/**
 * Default RAG tool instance with standard configuration
 */
export const ragTool = createRAGTool(); 