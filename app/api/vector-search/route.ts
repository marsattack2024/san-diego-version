import { NextRequest, NextResponse } from 'next/server';
import { findSimilarDocumentsOptimized } from '@/lib/vector/documentRetrieval';
import { formatDocumentsForDisplay } from '@/lib/vector/formatters';
import { logger } from '@/lib/logger';

/**
 * API route for vector search
 * POST /api/vector-search
 */
export async function POST(req: NextRequest) {
  const startTime = performance.now();
  
  try {
    const { query, limit, similarityThreshold, metadataFilter } = await req.json();
    
    // Validate input
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Invalid query: must be a non-empty string' },
        { status: 400 }
      );
    }
    
    // Get session ID from headers for tracking
    const sessionId = req.headers.get('x-session-id') || undefined;
    
    // Find similar documents
    const { documents, metrics: searchMetrics } = await findSimilarDocumentsOptimized(query, {
      limit,
      similarityThreshold,
      metadataFilter,
      sessionId
    });
    
    // Format documents for display
    const formattedDocuments = formatDocumentsForDisplay(documents);
    
    // Log successful search
    logger.info('Vector search completed', {
      queryLength: query.length,
      resultCount: documents.length,
      durationMs: searchMetrics.retrievalTimeMs,
      important: searchMetrics.isSlowQuery
    });
    
    // Return results
    return NextResponse.json({
      documents: formattedDocuments,
      metrics: searchMetrics
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    // Log error
    logger.error('Error in vector search API', { 
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration
    });
    
    // Return error response
    return NextResponse.json(
      { error: 'Failed to search documents' },
      { status: 500 }
    );
  }
} 