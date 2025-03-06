import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { supabase } from '@/lib/db';

const logger = edgeLogger;

const EMBEDDING_CONFIG = {
  model: 'text-embedding-3-small',
  dimensions: 1536
};

/**
 * Breaks down text into smaller chunks by splitting on periods
 * 
 * @param input - The text to chunk
 * @returns Array of text chunks
 */
function generateChunks(input: string): string[] {
  return input
    .trim()
    .split('.')
    .filter(i => i !== '');
}

/**
 * Creates a vector embedding from text input
 * 
 * @param text - The text to convert to an embedding vector
 * @returns Promise resolving to embedding vector
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const startTime = Date.now();
  
  try {
    logger.info('Creating embedding', { text_length: text.length });
    
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_CONFIG.model),
      value: text,
    });

    const duration = Date.now() - startTime;
    logger.info(
      'Successfully created embedding',
      { 
        text_length: text.length,
        duration_ms: duration,
        model: EMBEDDING_CONFIG.model
      }
    );

    return embedding;
  } catch (error) {
    logger.error(
      'Error creating embedding',
      { 
        error: error instanceof Error ? error.message : String(error),
        text_length: text.length,
        duration_ms: Date.now() - startTime
      }
    );
    throw error;
  }
}

/**
 * Finds relevant content from the database based on a user query
 * 
 * @param userQuery - The user's question or query
 * @param limit - Maximum number of results to return (default: 4)
 * @param similarityThreshold - Minimum similarity score (0-1) to include results (default: 0.5)
 * @returns Promise resolving to array of relevant content with similarity scores
 */
export async function findRelevantContent(
  userQuery: string, 
  limit = 5, 
  similarityThreshold = 0.5
) {
  const startTime = Date.now();
  
  try {
    logger.info('Finding relevant content', { query_length: userQuery.length });
    
    // Create embedding for the query
    const embedding = await createEmbedding(userQuery);
    
    // Search for similar content in Supabase
    // Note: Using the correct parameter order based on the error message
    const { data, error } = await supabase
      .rpc('match_documents', {
        query_embedding: embedding,
        match_count: limit,
        filter: {}
      });
    
    if (error) {
      throw error;
    }
    
    // Transform the response to the expected format
    const results = (data || []).map((item: any) => ({
      name: item.content || item.id || 'Unknown content',
      similarity: typeof item.similarity === 'number' ? item.similarity : 0
    }));
    
    const duration = Date.now() - startTime;
    logger.info(
      'Successfully found relevant content',
      { 
        query_length: userQuery.length,
        result_count: results.length,
        duration_ms: duration
      }
    );
    
    return results;
  } catch (error) {
    logger.error(
      'Error finding relevant content',
      { 
        error,
        query_length: userQuery.length,
        duration_ms: Date.now() - startTime
      }
    );
    throw error;
  }
}

/**
 * Simulates embedding creation for development/testing
 * In production, this would be replaced with a call to the OpenAI API
 */
async function simulateEmbedding(text: string, dimensions: number): Promise<number[]> {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Create a deterministic embedding based on the text
  // This is just for simulation - real embeddings would come from the API
  const embedding: number[] = [];
  const seed = hashString(text);
  
  for (let i = 0; i < dimensions; i++) {
    // Generate a pseudo-random value between -1 and 1
    const value = Math.sin(seed * (i + 1)) / 2 + 0.5;
    embedding.push(value);
  }
  
  // Normalize the embedding to unit length
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

/**
 * Simple string hashing function for deterministic simulation
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Creates embeddings for multiple texts in batch
 */
export async function createEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const startTime = Date.now();
  
  try {
    logger.info('Creating embeddings batch', { batch_size: texts.length });
    
    const { embeddings } = await embedMany({
      model: openai.embedding(EMBEDDING_CONFIG.model),
      values: texts,
    });

    const duration = Date.now() - startTime;
    logger.info(
      'Successfully created embeddings batch',
      { 
        batch_size: texts.length,
        duration_ms: duration,
        model: EMBEDDING_CONFIG.model
      }
    );

    return embeddings;
  } catch (error) {
    logger.error(
      'Error creating embeddings batch',
      { 
        error: error instanceof Error ? error.message : String(error),
        batch_size: texts.length,
        duration_ms: Date.now() - startTime
      }
    );
    throw error;
  }
}

/**
 * Creates embeddings for multiple text chunks
 * 
 * @param value - The source text to chunk and embed
 * @returns Promise resolving to array of objects with content and embedding
 */
export async function generateEmbeddings(
  value: string
): Promise<Array<{ embedding: number[]; content: string }>> {
  const startTime = Date.now();
  
  try {
    const chunks = generateChunks(value);
    logger.info('Creating embeddings batch', { chunk_count: chunks.length });
    
    const { embeddings } = await embedMany({
      model: openai.embedding(EMBEDDING_CONFIG.model),
      values: chunks,
    });
    
    const duration = Date.now() - startTime;
    logger.info(
      'Successfully created embeddings batch',
      { 
        chunk_count: chunks.length,
        duration_ms: duration,
        model: EMBEDDING_CONFIG.model
      }
    );
    
    return embeddings.map((embedding, i) => ({ 
      content: chunks[i], 
      embedding 
    }));
  } catch (error) {
    logger.error(
      'Error creating embeddings batch',
      { 
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime
      }
    );
    throw error;
  }
} 