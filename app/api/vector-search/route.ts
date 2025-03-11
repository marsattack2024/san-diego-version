import { NextRequest, NextResponse } from 'next/server';
import { findSimilarDocumentsOptimized } from '@/lib/vector/documentRetrieval';
import { formatDocumentsForDisplay } from '@/lib/vector/formatters';
import { logger } from '@/lib/logger/vector-logger';
import { initializeVectorSearch } from '@/lib/vector/init';

// Initialize vector search on module load with robust error handling
try {
  initializeVectorSearch();
} catch (error) {
  // Use console.error as a fallback in case logger methods aren't available
  console.error('Failed to initialize vector search:', error instanceof Error ? error.message : String(error));
  
  // Also try the logger, but in a way that won't break if methods are missing
  try {
    logger.logVectorError('vector_initialization', error);
  } catch (logError) {
    // Silently continue if logger fails
  }
}

export const dynamic = 'force-dynamic';

// Initialize vector search when this route is first loaded
const isInitialized = initializeVectorSearch();

/**
 * API route for vector search
 * POST /api/vector-search
 */
export async function POST(req: NextRequest) {
  const startTime = performance.now();
  
  try {
    // Check if vector search is initialized
    if (!isInitialized) {
      console.warn('Vector search is not initialized. Returning empty results.');
      return NextResponse.json({ 
        results: [], 
        message: 'Vector search is not available in this environment' 
      });
    }

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
    try {
      logger.logVectorResults(query, documents, searchMetrics, sessionId || 'unknown');
    } catch (logError) {
      console.error('Failed to log vector results:', logError);
    }
    
    // Return enhanced results
    return NextResponse.json({
      documents: formattedDocuments,
      metrics: enhancedMetrics
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    // Use console.error as fallback if logger fails
    console.error('Error in vector search:', error);
    try {
      logger.logVectorError('vector_search', error, { durationMs: duration });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    // Return error response
    return NextResponse.json(
      { error: 'Failed to perform vector search' },
      { status: 500 }
    );
  }
} 