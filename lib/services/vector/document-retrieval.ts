import { logger } from '@/lib/logger';
// Update import to use redis-client directly
import { redisCache } from '@/lib/cache/redis-client';
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

// Cache constants
const CACHE_TTL = {
    RAG_RESULTS: 12 * 60 * 60, // 12 hours default
    SHORT: 1 * 60 * 60 // 1 hour for frequent updates
};

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

// Generate a consistent cache key for RAG queries
async function generateConsistentCacheKey(queryText: string, options: DocumentSearchOptions = {}): Promise<string> {
    // Create a stable representation of the query and relevant options
    const keyContent = {
        query: queryText.toLowerCase().trim(),
        filter: options.metadataFilter || {},
        limit: options.limit || 10
    };

    // Use Web Crypto API for hashing to ensure consistency
    const msgUint8 = new TextEncoder().encode(JSON.stringify(keyContent));
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Return just the first 16 characters of the hash for a shorter key
    return hashHex.slice(0, 16);
}

// Helper function to create a tenant-specific RAG cache key
async function createRagCacheKey(tenantId: string, query: string): Promise<string> {
    const hash = await generateConsistentCacheKey(query);
    return `${tenantId}:rag:${hash}`;
}

// Updated implementation to use the centralized Redis cache directly
export async function findSimilarDocumentsOptimized(
    queryText: string,
    options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
    const ragOperationId = `rag-${Date.now().toString(36)}`;
    const startTime = performance.now();
    const tenantId = options.tenantId || 'global';

    // Generate cache key
    const cacheKey = await createRagCacheKey(tenantId, queryText);

    // Log the start of the RAG operation with cache check
    edgeLogger.info('Starting RAG operation with cache check', {
        operation: OPERATION_TYPES.RAG_SEARCH,
        ragOperationId,
        queryLength: queryText.length,
        queryPreview: queryText.substring(0, 20) + '...',
        cacheKey
    });

    try {
        const cachedResults = await redisCache.get(cacheKey);

        // Log cache check attempt
        edgeLogger.debug('RAG cache check completed', {
            operation: 'rag_cache_check',
            ragOperationId,
            cacheHit: !!cachedResults,
            valueType: cachedResults ? typeof cachedResults : 'null'
        });

        if (cachedResults) {
            try {
                const parsed = JSON.parse(typeof cachedResults === 'string' ? cachedResults : '');

                if (parsed && parsed.documents && Array.isArray(parsed.documents)) {
                    edgeLogger.info('Using cached RAG results', {
                        operation: OPERATION_TYPES.RAG_SEARCH,
                        ragOperationId,
                        documentCount: parsed.documents.length,
                        source: 'cache'
                    });

                    cacheStats.hits++;
                    return parsed;
                }
            } catch (parseError) {
                edgeLogger.warn('Failed to parse cached RAG results', {
                    operation: OPERATION_TYPES.RAG_SEARCH,
                    ragOperationId,
                    error: parseError instanceof Error ? parseError.message : String(parseError)
                });
            }
        }

        cacheStats.misses++;

        // No valid cache hit, perform the search
        const documents = await findSimilarDocuments(queryText, options);
        const retrievalTimeMs = Math.round(performance.now() - startTime);

        // Calculate metrics
        const metrics = calculateSearchMetrics(documents, retrievalTimeMs);

        // Create result object
        const result = { documents, metrics };

        // Cache the results for future use
        await redisCache.set(cacheKey, JSON.stringify(result), CACHE_TTL.RAG_RESULTS);

        edgeLogger.info('RAG search completed', {
            operation: OPERATION_TYPES.RAG_SEARCH,
            ragOperationId,
            documentCount: documents.length,
            retrievalTimeMs,
            source: 'search',
            cacheKey
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

// Helper function to cache scraped web content 
export async function cacheScrapedContent(tenantId: string, url: string, content: string): Promise<void> {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(url);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const key = `${tenantId}:scrape:${hashHex.slice(0, 16)}`;
        await redisCache.set(key, content, CACHE_TTL.RAG_RESULTS);

        edgeLogger.debug('Cached scraped content', {
            category: LOG_CATEGORIES.SYSTEM,
            url,
            contentLength: content.length,
            key
        });
    } catch (error) {
        edgeLogger.error('Failed to cache scraped content', {
            category: LOG_CATEGORIES.SYSTEM,
            url,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// Helper function to retrieve cached scraped content
export async function getCachedScrapedContent(tenantId: string, url: string): Promise<string | null> {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(url);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const key = `${tenantId}:scrape:${hashHex.slice(0, 16)}`;
        return await redisCache.get(key);
    } catch (error) {
        edgeLogger.error('Failed to retrieve cached scraped content', {
            category: LOG_CATEGORIES.SYSTEM,
            url,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
} 