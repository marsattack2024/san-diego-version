/**
 * Type definitions for vector embedding document retrieval
 */

/**
 * Represents a document retrieved from the vector database
 */
export interface RetrievedDocument {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}

/**
 * Options for document search operations
 */
export interface DocumentSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  
  /** Minimum similarity threshold (0-1) */
  similarityThreshold?: number;
  
  /** Filter by metadata fields */
  metadataFilter?: Record<string, any>;
  
  /** Session ID for tracking and logging */
  sessionId?: string;
}

/**
 * Response format for document search API
 */
export interface DocumentSearchResponse {
  /** Retrieved documents */
  documents: RetrievedDocument[];
  
  /** Performance and quality metrics */
  metrics?: {
    /** Number of documents found */
    count: number;
    
    /** Average similarity score */
    averageSimilarity: number;
    
    /** Highest similarity score */
    highestSimilarity: number;
    
    /** Lowest similarity score */
    lowestSimilarity: number;
    
    /** Time taken for retrieval in milliseconds */
    retrievalTimeMs: number;
  };
}

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  /** Model to use for embeddings */
  model: string;
  
  /** Dimensions of the embedding vectors */
  dimensions: number;
}