import { NextRequest, NextResponse } from 'next/server';
import { retrieveDocuments } from '@/lib/vector/documentRetrieval';
import { formatDocumentsForDisplay } from '@/lib/vector/formatters';
import { logger } from '@/lib/logger';
import { initializeVectorStore } from '@/lib/vector/init';

// Initialize vector store on module load
initializeVectorStore().catch(error => {
  logger.error('Vector store initialization failed', { error });
});

export const dynamic = 'force-dynamic';

/**
 * API route for vector search
 * POST /api/vector-search
 */
export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const requestId = crypto.randomUUID();
  
  try {
    const { query, limit, similarityThreshold, metadataFilter } = await req.json();
    
    // Validate input
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Invalid query parameter' },
        { status: 400 }
      );
    }
    
    // Get session ID from headers for tracking
    const sessionId = req.headers.get('x-session-id') || undefined;
    
    logger.info('Vector search request received', {
      requestId,
      operation: 'vector_search_start',
      queryLength: query.length,
      sessionId
    });

    // Find similar documents
    const documents = await retrieveDocuments(query, {
      limit,
      threshold: similarityThreshold,
      metadata: {
        ...metadataFilter,
        sessionId,
        requestId
      }
    });
    
    // Format documents for display
    const formattedDocuments = formatDocumentsForDisplay(documents);
    
    // Calculate metrics
    const metrics = {
      resultCount: documents.length,
      averageSimilarity: documents.reduce((acc, doc) => acc + doc.similarity, 0) / documents.length,
      highestSimilarity: Math.max(...documents.map(doc => doc.similarity)),
      lowestSimilarity: Math.min(...documents.map(doc => doc.similarity))
    };
    
    const duration = Math.round(performance.now() - startTime);
    
    logger.info('Vector search completed', {
      requestId,
      operation: 'vector_search_complete',
      documentCount: documents.length,
      durationMs: duration,
      slow: duration > 500,
      metrics: {
        ...metrics,
        averageSimilarityPercent: Math.round(metrics.averageSimilarity * 100),
        highestSimilarityPercent: Math.round(metrics.highestSimilarity * 100),
        lowestSimilarityPercent: Math.round(metrics.lowestSimilarity * 100)
      }
    });

    // Return enhanced results
    return NextResponse.json({
      documents: formattedDocuments,
      metrics
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    logger.error('Vector search failed', {
      requestId,
      error,
      operation: 'vector_search_error',
      durationMs: duration
    });

    // Return error response
    return NextResponse.json(
      { error: 'Failed to perform vector search' },
      { status: 500 }
    );
  }
} 