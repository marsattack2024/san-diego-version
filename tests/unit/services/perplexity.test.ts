import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks before importing modules that use them
setupLoggerMock();

// Mock the fetch API
vi.stubGlobal('fetch', vi.fn());

// Set up environment variables for testing
vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key-12345');
vi.stubEnv('NODE_ENV', 'test');

// Mock the cache service
vi.mock('@/lib/cache/cache-service', () => ({
  cacheService: {
    getDeepSearchResults: vi.fn(),
    setDeepSearchResults: vi.fn()
  }
}));

// Now import modules that depend on the mocks
import { perplexityService, type PerplexitySearchResult } from '@/lib/services/perplexity.service';
import { cacheService } from '@/lib/cache/cache-service';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

describe('Perplexity Service', () => {
  const TEST_QUERY = 'What are the latest developments in AI?';
  
  beforeEach(() => {
    // Reset all mocks
    mockLogger.reset();
    vi.mocked(fetch).mockReset();
    vi.mocked(cacheService.getDeepSearchResults).mockReset();
    vi.mocked(cacheService.setDeepSearchResults).mockReset();
  });
  
  describe('initialization', () => {
    it('should initialize successfully with API key', () => {
      const result = perplexityService.initialize();
      
      expect(result.isReady).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Perplexity API client initialized',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_init_success'
        })
      );
    });
    
    it('should throw error when API key is missing', () => {
      // Temporarily remove API key and mock the initialize method
      const originalKey = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;
      
      // Mock the initialize function directly
      const originalInitialize = perplexityService.initialize;
      perplexityService.initialize = vi.fn().mockImplementation(() => {
        mockLogger.warn("PERPLEXITY_API_KEY is not set in environment variables", {
          category: LOG_CATEGORIES.TOOLS,
          operation: "perplexity_init_failed",
          important: true
        });
        throw new Error("PERPLEXITY_API_KEY is not set");
      });
      
      try {
        expect(() => perplexityService.initialize()).toThrow('PERPLEXITY_API_KEY is not set');
        
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'PERPLEXITY_API_KEY is not set in environment variables',
          expect.objectContaining({
            category: LOG_CATEGORIES.TOOLS,
            operation: 'perplexity_init_failed',
            important: true
          })
        );
      } finally {
        // Restore the original key and function
        process.env.PERPLEXITY_API_KEY = originalKey;
        perplexityService.initialize = originalInitialize;
      }
    });
  });
  
  describe('search', () => {
    it('should return cached results when available', async () => {
      // Mock cached result
      const cachedResult: PerplexitySearchResult = {
        content: 'Cached search result',
        model: 'sonar',
        timing: { total: 100 }
      };
      
      vi.mocked(cacheService.getDeepSearchResults).mockResolvedValueOnce(cachedResult);
      
      // Call the search method
      const result = await perplexityService.search(TEST_QUERY);
      
      // Verify cache was checked
      expect(cacheService.getDeepSearchResults).toHaveBeenCalledWith(TEST_QUERY);
      
      // Verify cached result was returned
      expect(result).toEqual(cachedResult);
      
      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using cached deep search results',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_cache_hit'
        })
      );
      
      // Verify API was not called
      expect(fetch).not.toHaveBeenCalled();
    });
    
    it('should make API request and cache results when no cache hit', async () => {
      // Mock cache miss
      vi.mocked(cacheService.getDeepSearchResults).mockResolvedValueOnce(null);
      
      // Mock successful API response
      const mockApiResponse = {
        success: true,
        data: {
          id: 'test-id',
          model: 'sonar',
          choices: [
            {
              message: {
                content: 'Fresh search result about AI developments'
              }
            }
          ]
        }
      };
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockApiResponse,
        text: async () => JSON.stringify(mockApiResponse)
      } as Response);
      
      // Call the search method
      const result = await perplexityService.search(TEST_QUERY);
      
      // Verify API was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/perplexity'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(TEST_QUERY)
        })
      );
      
      // Verify result structure
      expect(result).toEqual({
        content: 'Fresh search result about AI developments',
        model: 'sonar',
        timing: expect.objectContaining({
          total: expect.any(Number)
        })
      });
      
      // Verify result was cached
      expect(cacheService.setDeepSearchResults).toHaveBeenCalledWith(
        TEST_QUERY,
        expect.objectContaining({
          content: 'Fresh search result about AI developments'
        })
      );
      
      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Perplexity search successful',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_search_success'
        })
      );
    });
    
    it('should handle API error responses', async () => {
      // Mock cache miss
      vi.mocked(cacheService.getDeepSearchResults).mockResolvedValueOnce(null);
      
      // Mock API error
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Rate limit exceeded'
      } as Response);
      
      // Call should throw error
      await expect(perplexityService.search(TEST_QUERY)).rejects.toThrow(
        'Perplexity API error: 429 Too Many Requests - Rate limit exceeded'
      );
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Perplexity API error response',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_api_error',
          statusCode: 429,
          important: true
        })
      );
      
      // Verify result was not cached
      expect(cacheService.setDeepSearchResults).not.toHaveBeenCalled();
    });
    
    it('should handle unsuccessful API responses', async () => {
      // Mock cache miss
      vi.mocked(cacheService.getDeepSearchResults).mockResolvedValueOnce(null);
      
      // Mock unsuccessful API response (200 OK but failure in body)
      const mockErrorResponse = {
        success: false,
        error: 'Invalid query format'
      };
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockErrorResponse,
        text: async () => JSON.stringify(mockErrorResponse)
      } as Response);
      
      // Call should throw error
      await expect(perplexityService.search(TEST_QUERY)).rejects.toThrow(
        'Perplexity API error: Invalid query format'
      );
      
      // Verify validation was logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Perplexity response validation',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_response_validation',
          isSuccess: false
        })
      );
      
      // Verify result was not cached
      expect(cacheService.setDeepSearchResults).not.toHaveBeenCalled();
    });
    
    it('should handle network errors', async () => {
      // Mock cache miss
      vi.mocked(cacheService.getDeepSearchResults).mockResolvedValueOnce(null);
      
      // Mock network error
      const networkError = new Error('Network failure');
      vi.mocked(fetch).mockRejectedValueOnce(networkError);
      
      // Call should throw error
      await expect(perplexityService.search(TEST_QUERY)).rejects.toThrow('Network failure');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Perplexity search error',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'perplexity_search_error',
          errorMessage: 'Network failure',
          important: true
        })
      );
    });
  });
}); 