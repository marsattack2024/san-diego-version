/**
 * Type definitions for vector search and embeddings
 */

/**
 * Represents a document retrieved from vector search
 */
export interface RetrievedDocument {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}

/**
 * Configuration for embedding models
 */
export interface EmbeddingConfig {
  model: string;
  dimensions: number;
} 