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
    
    // Enhanced metrics to include in the response
    const enhancedMetrics = {
      ...searchMetrics,
      resultCount: documents.length,
      averageSimilarityPercent: Math.round(searchMetrics.averageSimilarity * 100),
      highestSimilarityPercent: Math.round(searchMetrics.highestSimilarity * 100),
      lowestSimilarityPercent: Math.round(searchMetrics.lowestSimilarity * 100),
    };
    
    // Log successful search with additional details
    logger.info('Vector search completed', {
      queryLength: query.length,
      resultCount: documents.length,
      durationMs: searchMetrics.retrievalTimeMs,
      averageSimilarity: searchMetrics.averageSimilarity,
      documentIds: documents.map(d => d.id),
      important: searchMetrics.isSlowQuery
    });
    
    // Return enhanced results
    return NextResponse.json({
      documents: formattedDocuments,
      metrics: enhancedMetrics
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