import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { cacheService } from '@/lib/cache/cache-service';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';

export const runtime = 'edge';

/**
 * API endpoint to test the Redis caching system.
 * Tests setting and getting different data types and checks for serialization issues.
 * 
 * NOTE: This endpoint does not require authentication for testing purposes only.
 * It should be removed or secured in production.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const operation = searchParams.get('operation') || 'get';
  const key = searchParams.get('key') || 'test-key';
  const value = searchParams.get('value') || `test-value-${Date.now()}`;
  const ttl = searchParams.get('ttl') ? parseInt(searchParams.get('ttl')!) : undefined;
  const query = searchParams.get('query') || 'test query';
  const url = searchParams.get('url') || 'https://example.com';
  const options = searchParams.get('options') ? JSON.parse(searchParams.get('options')!) : { tenantId: 'test' };

  const runtime = typeof (globalThis as any).EdgeRuntime === 'string' ? 'edge' : 'node';

  const startTime = Date.now();
  let result: any = null;
  let error: any = null;

  try {
    edgeLogger.info('Cache test operation', {
      category: LOG_CATEGORIES.SYSTEM,
      operation: `cache_test_${operation}`,
      key,
      runtime,
      env: process.env.NODE_ENV
    });

    // Test different cache operations based on the "operation" parameter
    switch (operation) {
      case 'set': {
        await cacheService.set(key, value, ttl ? { ttl } : undefined);
        result = { success: true, message: `Value set for key: ${key}` };
        break;
      }

      case 'get': {
        const cachedValue = await cacheService.get(key);
        result = {
          success: true,
          message: cachedValue ? `Value retrieved for key: ${key}` : `No value found for key: ${key}`,
          value: cachedValue
        };
        break;
      }

      case 'delete': {
        await cacheService.delete(key);
        result = { success: true, message: `Key deleted: ${key}` };
        break;
      }

      case 'rag': {
        // Test RAG-specific methods
        if (operation.includes('set')) {
          const mockResults = { documents: [{ id: 1, content: 'Test content', score: 0.95 }] };
          await cacheService.setRagResults(query, mockResults, options);
          result = { success: true, message: `RAG results set for query: ${query}` };
        } else {
          const cachedResults = await cacheService.getRagResults(query, options);
          result = {
            success: true,
            message: cachedResults ? `RAG results retrieved for query: ${query}` : `No RAG results found for query: ${query}`,
            value: cachedResults
          };
        }
        break;
      }

      case 'scraper': {
        // Test scraper-specific methods
        if (operation.includes('set')) {
          const scrapedContent = `<div>Scraped content for ${url} at ${new Date().toISOString()}</div>`;
          await cacheService.setScrapedContent(url, scrapedContent);
          result = { success: true, message: `Scraped content set for URL: ${url}` };
        } else {
          const cachedContent = await cacheService.getScrapedContent(url);
          result = {
            success: true,
            message: cachedContent ? `Scraped content retrieved for URL: ${url}` : `No scraped content found for URL: ${url}`,
            value: cachedContent
          };
        }
        break;
      }

      case 'deep-search': {
        // Test deep search-specific methods
        if (operation.includes('set')) {
          const searchResults = { content: `Deep search results for "${query}"`, model: 'test-model' };
          await cacheService.setDeepSearchResults(query, searchResults);
          result = { success: true, message: `Deep search results set for query: ${query}` };
        } else {
          const cachedResults = await cacheService.getDeepSearchResults(query);
          result = {
            success: true,
            message: cachedResults ? `Deep search results retrieved for query: ${query}` : `No deep search results found for query: ${query}`,
            value: cachedResults
          };
        }
        break;
      }

      default: {
        result = { success: false, message: `Unknown operation: ${operation}` };
      }
    }

    const duration = Date.now() - startTime;

    return successResponse({
      operation,
      key,
      runtime,
      environment: process.env.NODE_ENV,
      durationMs: duration,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    error = {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : 'No stack available'
    };

    edgeLogger.error('Cache test error', {
      category: LOG_CATEGORIES.SYSTEM,
      operation: `cache_test_error`,
      error: error.message,
      runtime
    });

    const duration = Date.now() - startTime;

    return errorResponse(
      'Cache test error',
      {
        operation,
        key,
        runtime,
        environment: process.env.NODE_ENV,
        durationMs: duration,
        error,
        timestamp: new Date().toISOString()
      },
      500
    );
  }
} 