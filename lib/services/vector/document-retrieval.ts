import { logger } from '@/lib/logger';
// Remove redisCache import and replace with cacheService
import { cacheService } from '@/lib/cache/cache-service';
import { THRESHOLDS } from '@/lib/logger/edge-logger';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES, OPERATION_TYPES } from '@/lib/logger/constants';
import { supabase } from '@/lib/db';
import { createEmbedding } from './embeddings';

// Define missing types
export interface RetrievedDocument {
    id: string;
    content: string;
    score?: number;
    similarity?: number;
    metadata?: Record<string, any>;
}

export interface DocumentSearchOptions {
    limit?: number;
    metadataFilter?: Record<string, any>;
    sessionId?: string;
    tenantId?: string;
    similarityThreshold?: number;
}

export interface DocumentSearchMetrics {
    count: number;
    averageSimilarity: number;
    highestSimilarity: number;
    lowestSimilarity: number;
    retrievalTimeMs: number;
    isSlowQuery: boolean;
    fromCache?: boolean;
}

// Cache statistics for monitoring
const cacheStats = {
    hits: 0,
    misses: 0,
    semanticHits: 0
};

// Log cache statistics periodically
setInterval(() => {
    logger.info('Vector cache statistics', {
        ...cacheStats
    });
}, 5 * 60 * 1000); // Log every 5 minutes

interface SupabaseDocument {
    id: string;
    content: string;
    similarity: number;
    metadata?: string;
}

async function findSimilarDocuments(
    queryText: string,
    options: DocumentSearchOptions = {}
): Promise<RetrievedDocument[]> {
    const userQueryEmbedded = await createEmbedding(queryText);

    const { data: similarDocs, error } = await supabase
        .rpc('match_documents', {
            query_embedding: userQueryEmbedded,
            match_count: options.limit || 5,
            filter: options.metadataFilter || {}
        });

    if (error) {
        throw error;
    }

    return (similarDocs as SupabaseDocument[]).map(doc => ({
        id: doc.id,
        content: doc.content,
        similarity: doc.similarity,
        score: doc.similarity, // Add score field for backward compatibility
        metadata: typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {})
    }));
}

// Calculate search metrics from retrieved documents
function calculateSearchMetrics(documents: RetrievedDocument[], retrievalTimeMs: number): DocumentSearchMetrics {
    const validScores = documents
        .filter(doc => typeof doc.score === 'number' || typeof doc.similarity === 'number')
        .map(doc => doc.score || doc.similarity || 0);

    return {
        count: documents.length,
        averageSimilarity: validScores.length ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0,
        highestSimilarity: validScores.length ? Math.max(...validScores) : 0,
        lowestSimilarity: validScores.length ? Math.min(...validScores) : 0,
        retrievalTimeMs,
        isSlowQuery: retrievalTimeMs > 500
    };
}

// Updated implementation to use the centralized CacheService
export async function findSimilarDocumentsOptimized(
    queryText: string,
    options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
    const ragOperationId = `rag-${Date.now().toString(36)}`;
    const startTime = performance.now();
    const tenantId = options.tenantId || 'global';

    // Log the start of the RAG operation with cache check
    edgeLogger.info('Starting RAG operation with cache check', {
        operation: OPERATION_TYPES.RAG_SEARCH,
        ragOperationId,
        queryLength: queryText.length,
        queryPreview: queryText.substring(0, 20) + '...'
    });

    try {
        // Use the cacheService for RAG results, passing options with tenantId
        const cachedResults = await cacheService.getRagResults<{
            documents: RetrievedDocument[],
            metrics: DocumentSearchMetrics
        }>(queryText, { 
            tenantId, 
            metadataFilter: options.metadataFilter,
            limit: options.limit 
        });

        // Log cache check attempt
        edgeLogger.debug('RAG cache check completed', {
            operation: 'rag_cache_check',
            ragOperationId,
            cacheHit: !!cachedResults
        });

        if (cachedResults) {
            edgeLogger.info('Using cached RAG results', {
                operation: OPERATION_TYPES.RAG_SEARCH,
                ragOperationId,
                documentCount: cachedResults.documents.length,
                source: 'cache'
            });

            cacheStats.hits++;
            // Add fromCache flag for transparency
            return {
                ...cachedResults,
                metrics: {
                    ...cachedResults.metrics,
                    fromCache: true
                }
            };
        }

        cacheStats.misses++;

        // No valid cache hit, perform the search
        const documents = await findSimilarDocuments(queryText, options);
        const retrievalTimeMs = Math.round(performance.now() - startTime);

        // Calculate metrics
        const metrics = calculateSearchMetrics(documents, retrievalTimeMs);

        // Create result object
        const result = { documents, metrics };

        // Cache the results using the standardized approach
        await cacheService.setRagResults(queryText, result, {
            tenantId,
            metadataFilter: options.metadataFilter,
            limit: options.limit
        });

        edgeLogger.info('RAG search completed', {
            operation: OPERATION_TYPES.RAG_SEARCH,
            ragOperationId,
            documentCount: documents.length,
            retrievalTimeMs,
            source: 'search'
        });

        return result;
    } catch (error) {
        const retrievalTimeMs = Math.round(performance.now() - startTime);

        edgeLogger.error('RAG search failed', {
            operation: OPERATION_TYPES.RAG_SEARCH,
            ragOperationId,
            error: error instanceof Error ? error.message : String(error),
            queryLength: queryText.length,
            retrievalTimeMs
        });

        // Return empty result on error
        return {
            documents: [],
            metrics: {
                count: 0,
                averageSimilarity: 0,
                highestSimilarity: 0,
                lowestSimilarity: 0,
                retrievalTimeMs,
                isSlowQuery: false
            }
        };
    }
}

// Update the cacheScrapedContent function to use cacheService
export async function cacheScrapedContent(tenantId: string, url: string, content: string): Promise<void> {
    try {
        await cacheService.setScrapedContent(url, content);
        
        edgeLogger.debug('Cached scraped content', {
            category: LOG_CATEGORIES.TOOLS,
            tenantId,
            urlLength: url.length
        });
    } catch (error) {
        edgeLogger.error('Failed to cache scraped content', {
            category: LOG_CATEGORIES.TOOLS,
            error: error instanceof Error ? error.message : String(error),
            tenantId,
            urlLength: url.length
        });
    }
}

// Helper function to retrieve cached scraped content
export async function getCachedScrapedContent(tenantId: string, url: string): Promise<string | null> {
    try {
        // Use the cacheService instead of direct Redis access and custom hashing
        return await cacheService.getScrapedContent(url);
    } catch (error) {
        edgeLogger.error('Failed to retrieve cached scraped content', {
            category: LOG_CATEGORIES.SYSTEM,
            url,
            tenantId,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
} 