/**
 * Vector Search Service
 * 
 * Encapsulates operations for document embedding, vector storage,
 * and semantic search functionality. This service is designed to be used
 * by RAG (Retrieval Augmented Generation) features in the application.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/db';

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
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

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
                embeddingModel: 'text-embedding-3-small',
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

            // Generate embeddings for all texts using OpenAI API directly
            const response = await fetch(OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    input: texts,
                    model: 'text-embedding-3-small',
                    dimensions: EMBEDDING_DIMENSION
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            const embeddings = result.data.map((item: any) => item.embedding);

            const duration = Date.now() - startTime;

            // Estimate token usage from response
            const promptTokens = result.usage?.prompt_tokens || Math.ceil(texts.join(' ').length / 4);
            const totalTokens = result.usage?.total_tokens || promptTokens;

            // Log successful embedding
            edgeLogger.info('Embedding generation completed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'embedding_success',
                operationId,
                durationMs: duration,
                textCount: texts.length,
                embeddingCount: embeddings.length,
                embeddingDimension: embeddings[0]?.length || 0,
                promptTokens,
                totalTokens
            });

            return {
                embeddings,
                usage: {
                    promptTokens,
                    totalTokens
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log error
            edgeLogger.error('Embedding generation failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'embedding_error',
                operationId,
                errorMessage,
                durationMs: duration,
                textCount: texts.length
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
                operation: 'semantic_search_started',
                operationId,
                queryLength: query.length,
                collection,
                limit
            });

            // Generate embedding for the query
            const embeddingResult = await this.generateEmbeddings([query]);
            const queryEmbedding = embeddingResult.embeddings[0];

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

            // Transform results to SearchResult format
            const results: SearchResult[] = documents.map((doc: any) => ({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                similarity: doc.similarity
            }));

            // Log successful search
            edgeLogger.info('Semantic search completed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'semantic_search_success',
                operationId,
                durationMs: duration,
                resultCount: results.length,
                collection
            });

            return results;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log error
            edgeLogger.error('Semantic search failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'semantic_search_error',
                operationId,
                errorMessage,
                durationMs: duration,
                collection,
                query
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
}

// Export a singleton instance
export const vectorSearchService = new VectorSearchService(); 