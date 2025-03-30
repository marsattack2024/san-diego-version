/**
 * Vector Search Service
 * 
 * Encapsulates operations for document embedding, vector storage,
 * and semantic search functionality. This service is designed to be used
 * by RAG (Retrieval Augmented Generation) features in the application.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES, OPERATION_TYPES } from '@/lib/logger/constants';
import { THRESHOLDS } from '@/lib/logger/edge-logger';
import { createClient } from '@/utils/supabase/server';
import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { supabase } from '@/lib/db';
import { cacheService } from '@/lib/cache/cache-service';

// Types
export interface EmbeddingDocument {
    id?: string;
    content: string;
    metadata: DocumentMetadata;
    embedding?: number[];
}

export interface DocumentMetadata {
    source: string;
    title?: string;
    url?: string;
    author?: string;
    created_at?: string;
    document_type?: string;
    [key: string]: any;
}

export interface SearchResult {
    id: string;
    content: string;
    metadata: DocumentMetadata;
    similarity: number;
}

export interface EmbeddingRequest {
    texts: string[];
    modelName?: string;
}

export interface EmbeddingResult {
    embeddings: number[][];
    usage: {
        promptTokens: number;
        totalTokens: number;
    };
}

export interface VectorSearchOptions {
    collection?: string;
    limit?: number;
    minScore?: number;
    filters?: Record<string, any>;
}

// Constants
const EMBEDDING_DIMENSION = 1536; // OpenAI embedding dimension
const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Vector Search Service class
 * Provides methods for embedding generation and similarity search
 */
class VectorSearchService {
    private isInitialized = false;

    constructor() {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.OPENAI_API_KEY) {
            this.isInitialized = true;

            edgeLogger.info('Vector Search service initialized', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_search_init',
                embeddingModel: EMBEDDING_MODEL,
                dimensions: EMBEDDING_DIMENSION
            });
        } else {
            edgeLogger.warn('Vector Search service initialization failed: missing environment variables', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_search_init_failed'
            });
        }
    }

    /**
     * Check if the service is properly initialized
     * @returns Boolean indicating if service is ready
     */
    public isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Generate embeddings for a list of texts
     * @param texts Array of text strings to embed
     * @returns Array of embedding vectors
     */
    public async generateEmbeddings(texts: string[]): Promise<EmbeddingResult> {
        const operationId = `embed-${Date.now().toString(36)}`;
        const startTime = Date.now();

        try {
            if (!this.isInitialized) {
                throw new Error('Embedding service not initialized');
            }

            // Log embedding request
            edgeLogger.info('Embedding generation started', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'embedding_started',
                operationId,
                textCount: texts.length,
                totalCharacters: texts.reduce((acc, text) => acc + text.length, 0)
            });

            // Generate embeddings using AI SDK
            const { embeddings, usage } = await embedMany({
                model: openai.embedding(EMBEDDING_MODEL),
                values: texts,
            });

            const duration = Date.now() - startTime;

            // Log success
            edgeLogger.info('Embedding generation completed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'embedding_completed',
                operationId,
                textCount: texts.length,
                duration,
                usage: {
                    promptTokens: usage?.tokens || 0,
                    totalTokens: usage?.tokens || 0
                }
            });

            return {
                embeddings,
                usage: {
                    promptTokens: usage?.tokens || Math.ceil(texts.join(' ').length / 4),
                    totalTokens: usage?.tokens || Math.ceil(texts.join(' ').length / 4)
                }
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            // Log error
            edgeLogger.error('Embedding generation failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'embedding_failed',
                operationId,
                error: error instanceof Error ? error.message : String(error),
                textCount: texts.length,
                duration
            });

            throw error;
        }
    }

    /**
     * Store a document with its embedding in Supabase
     * @param document Document content and metadata
     * @param collection Collection name in the database
     * @returns ID of the stored document
     */
    public async storeDocument(
        document: EmbeddingDocument,
        collection = 'documents'
    ): Promise<string> {
        const operationId = `store-${Date.now().toString(36)}`;
        const startTime = Date.now();

        try {
            if (!this.isInitialized) {
                throw new Error('Vector search service not initialized');
            }

            // Generate embedding if not provided
            if (!document.embedding) {
                const embeddingResult = await this.generateEmbeddings([document.content]);
                document.embedding = embeddingResult.embeddings[0];
            }

            // Prepare document for storage
            const documentToStore = {
                content: document.content,
                metadata: document.metadata,
                embedding: document.embedding
            };

            // Store in Supabase
            const { data, error } = await supabase
                .from(collection)
                .insert(documentToStore)
                .select('id')
                .single();

            if (error) {
                throw new Error(`Supabase storage error: ${error.message}`);
            }

            const documentId = data.id;
            const duration = Date.now() - startTime;

            // Log successful storage
            edgeLogger.info('Document stored in vector database', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_store_success',
                operationId,
                durationMs: duration,
                documentId,
                collection,
                contentLength: document.content.length,
                metadataSource: document.metadata.source
            });

            return documentId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log error
            edgeLogger.error('Document storage failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_store_error',
                operationId,
                errorMessage,
                durationMs: duration,
                collection,
                metadataSource: document.metadata.source
            });

            throw error;
        }
    }

    /**
     * Perform a semantic search in the vector database
     * @param query Search query text
     * @param options Search options
     * @returns Array of search results sorted by similarity
     */
    public async semanticSearch(
        query: string,
        options: VectorSearchOptions = {}
    ): Promise<SearchResult[]> {
        const operationId = `search-${Date.now().toString(36)}`;
        const startTime = Date.now();

        // Set defaults
        const collection = options.collection || 'documents';
        const limit = options.limit || DEFAULT_SEARCH_LIMIT;
        const minScore = options.minScore || DEFAULT_SIMILARITY_THRESHOLD;

        try {
            if (!this.isInitialized) {
                throw new Error('Vector search service not initialized');
            }

            // Log search request
            edgeLogger.info('Semantic search started', {
                category: LOG_CATEGORIES.TOOLS,
                operation: OPERATION_TYPES.VECTOR_SEARCH,
                operationId,
                queryLength: query.length,
                queryPreview: query.length > 20 ? query.substring(0, 20) + '...' : query,
                collection,
                limit,
                minSimilarity: minScore,
                filterApplied: !!options.filters,
                metadataFilters: options.filters ? Object.keys(options.filters) : []
            });

            // Generate embedding for the query
            const embeddingResult = await this.generateEmbeddings([query]);
            const queryEmbedding = embeddingResult.embeddings[0];

            // Calculate query embedding norm for metrics
            const queryEmbeddingNorm = Math.sqrt(
                queryEmbedding.reduce((sum, val) => sum + val * val, 0)
            );

            // Build Supabase query
            const { data: documents, error } = await supabase
                .rpc('match_documents', {
                    query_embedding: queryEmbedding,
                    match_threshold: minScore,
                    match_count: limit,
                    collection_name: collection
                });

            if (error) {
                throw new Error(`Supabase search error: ${error.message}`);
            }

            const duration = Date.now() - startTime;
            const isSlow = duration > THRESHOLDS.SLOW_OPERATION;
            const isImportant = duration > THRESHOLDS.IMPORTANT_THRESHOLD;

            // Transform results to SearchResult format
            const results: SearchResult[] = documents.map((doc: any) => ({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                similarity: doc.similarity
            }));

            // Calculate similarity distribution for enhanced logging
            const similarityDistribution = results.length > 0
                ? {
                    max: results[0].similarity,
                    min: results[results.length - 1].similarity,
                    p75: results.length >= 4 ? results[Math.floor(results.length * 0.25)].similarity : null,
                    p50: results.length >= 2 ? results[Math.floor(results.length * 0.5)].similarity : null,
                    p25: results.length >= 4 ? results[Math.floor(results.length * 0.75)].similarity : null,
                }
                : {};

            // Calculate average similarity
            const avgSimilarity = results.length > 0
                ? results.reduce((sum, doc) => sum + doc.similarity, 0) / results.length
                : 0;

            // Log successful search with enhanced metrics
            if (isSlow) {
                edgeLogger.warn('Semantic search completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: OPERATION_TYPES.VECTOR_SEARCH,
                    operationId,
                    durationMs: duration,
                    resultCount: results.length,
                    collection,
                    vectorDimensions: queryEmbedding.length,
                    queryEmbeddingNorm,
                    similarityDistribution,
                    avgSimilarity,
                    slow: true,
                    important: isImportant,
                    status: 'completed'
                });
            } else {
                edgeLogger.info('Semantic search completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: OPERATION_TYPES.VECTOR_SEARCH,
                    operationId,
                    durationMs: duration,
                    resultCount: results.length,
                    collection,
                    vectorDimensions: queryEmbedding.length,
                    queryEmbeddingNorm,
                    similarityDistribution,
                    avgSimilarity,
                    slow: false,
                    important: false,
                    status: 'completed'
                });
            }

            return results;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log error with enhanced context
            edgeLogger.error('Semantic search failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: OPERATION_TYPES.VECTOR_SEARCH,
                operationId,
                errorMessage,
                durationMs: duration,
                collection,
                queryLength: query.length,
                queryPreview: query.length > 50 ? query.substring(0, 50) + '...' : query,
                important: true,
                status: 'error'
            });

            throw error;
        }
    }

    /**
     * Delete a document from the vector database
     * @param documentId ID of the document to delete
     * @param collection Collection name in the database
     * @returns Boolean indicating success
     */
    public async deleteDocument(
        documentId: string,
        collection = 'documents'
    ): Promise<boolean> {
        try {
            if (!this.isInitialized) {
                throw new Error('Vector search service not initialized');
            }

            // Delete from Supabase
            const { error } = await supabase
                .from(collection)
                .delete()
                .eq('id', documentId);

            if (error) {
                throw new Error(`Supabase deletion error: ${error.message}`);
            }

            // Log successful deletion
            edgeLogger.info('Document deleted from vector database', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_delete_success',
                documentId,
                collection
            });

            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log error
            edgeLogger.error('Document deletion failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_delete_error',
                errorMessage,
                documentId,
                collection
            });

            throw error;
        }
    }

    /**
     * Get document by ID from the vector database
     * @param documentId ID of the document to retrieve
     * @param collection Collection name in the database
     * @returns Document content and metadata
     */
    public async getDocument(
        documentId: string,
        collection = 'documents'
    ): Promise<EmbeddingDocument> {
        try {
            if (!this.isInitialized) {
                throw new Error('Vector search service not initialized');
            }

            // Retrieve from Supabase
            const { data, error } = await supabase
                .from(collection)
                .select('id, content, metadata')
                .eq('id', documentId)
                .single();

            if (error) {
                throw new Error(`Supabase retrieval error: ${error.message}`);
            }

            if (!data) {
                throw new Error(`Document with ID ${documentId} not found`);
            }

            return {
                id: data.id,
                content: data.content,
                metadata: data.metadata
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log error
            edgeLogger.error('Document retrieval failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_get_error',
                errorMessage,
                documentId,
                collection
            });

            throw error;
        }
    }

    /**
     * Performs a vector similarity search on the kb_documents table
     * @param embedding The embedding vector to search against
     * @param limit Maximum number of results to return
     * @param threshold Minimum similarity threshold
     * @returns Array of matching documents with their similarity scores
     */
    public async similaritySearch(
        embedding: number[],
        limit: number = DEFAULT_SEARCH_LIMIT,
        threshold: number = DEFAULT_SIMILARITY_THRESHOLD
    ): Promise<Array<{ id: string; content: string; metadata: any; similarity: number }>> {
        const operationId = `search-${Date.now().toString(36)}`;
        const startTime = Date.now();

        try {
            if (!this.isInitialized) {
                throw new Error('Vector search service not initialized');
            }

            const supabase = await createClient();

            // Log search request
            edgeLogger.info('Vector similarity search started', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_search_started',
                operationId,
                embeddingLength: embedding.length,
                limit,
                threshold
            });

            // Generate embedding for the query
            const embeddingResult = await this.generateEmbeddings([JSON.stringify(embedding)]);
            const queryEmbedding = embeddingResult.embeddings[0];

            // Calculate query embedding norm for metrics
            const queryEmbeddingNorm = Math.sqrt(
                queryEmbedding.reduce((sum, val) => sum + val * val, 0)
            );

            // Build Supabase query
            const { data: documents, error } = await supabase
                .rpc('match_documents', {
                    query_embedding: queryEmbedding,
                    match_threshold: threshold,
                    match_count: limit,
                    collection_name: 'documents'
                });

            if (error) {
                throw new Error(`Supabase search error: ${error.message}`);
            }

            const duration = Date.now() - startTime;
            const isSlow = duration > THRESHOLDS.SLOW_OPERATION;
            const isImportant = duration > THRESHOLDS.IMPORTANT_THRESHOLD;

            // Transform results to SearchResult format
            const results: Array<{ id: string; content: string; metadata: any; similarity: number }> = documents.map((doc: any) => ({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                similarity: doc.similarity
            }));

            // Calculate similarity distribution for enhanced logging
            const similarityDistribution = results.length > 0
                ? {
                    max: results[0].similarity,
                    min: results[results.length - 1].similarity,
                    p75: results.length >= 4 ? results[Math.floor(results.length * 0.25)].similarity : null,
                    p50: results.length >= 2 ? results[Math.floor(results.length * 0.5)].similarity : null,
                    p25: results.length >= 4 ? results[Math.floor(results.length * 0.75)].similarity : null,
                }
                : {};

            // Calculate average similarity
            const avgSimilarity = results.length > 0
                ? results.reduce((sum, doc) => sum + doc.similarity, 0) / results.length
                : 0;

            // Log successful search with enhanced metrics
            if (isSlow) {
                edgeLogger.warn('Vector similarity search completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: 'vector_search_completed',
                    operationId,
                    durationMs: duration,
                    resultCount: results.length,
                    vectorDimensions: queryEmbedding.length,
                    queryEmbeddingNorm,
                    similarityDistribution,
                    avgSimilarity,
                    slow: true,
                    important: isImportant,
                    status: 'completed'
                });
            } else {
                edgeLogger.info('Vector similarity search completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: 'vector_search_completed',
                    operationId,
                    durationMs: duration,
                    resultCount: results.length,
                    vectorDimensions: queryEmbedding.length,
                    queryEmbeddingNorm,
                    similarityDistribution,
                    avgSimilarity,
                    slow: false,
                    important: false,
                    status: 'completed'
                });
            }

            return results;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log error with enhanced context
            edgeLogger.error('Vector similarity search failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'vector_search_error',
                operationId,
                errorMessage,
                durationMs: duration,
                vectorDimensions: embedding.length,
                limit,
                threshold,
                important: true,
                status: 'error'
            });

            throw error;
        }
    }
}

// Export a singleton instance
export const vectorSearchService = new VectorSearchService(); 