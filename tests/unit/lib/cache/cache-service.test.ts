/**
 * Unit Tests for Cache Service
 * 
 * Tests the functionality of the cache service with mocked Redis client.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from '@/lib/cache/cache-service';
import { CACHE_TTL, CACHE_NAMESPACES } from '@/lib/cache/constants';
import { sleep } from '@/tests/helpers/test-utils';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Define LOG_CATEGORIES for the test
// These should match the ones in the constants file
const LOG_CATEGORIES = {
  CACHE: 'cache',
  RAG: 'rag',
  WEBSCRAPER: 'webscraper'
};

// Set up mock logger before importing modules that use it
setupLoggerMock();

// Mock the Redis client
vi.mock('@upstash/redis', () => {
  const mockStore = new Map<string, any>();
  const mockExpirations = new Map<string, number>();
  
  return {
    Redis: {
      fromEnv: () => ({
        set: vi.fn().mockImplementation(async (key: string, value: any, options?: { ex?: number }) => {
          mockStore.set(key, value);
          if (options?.ex) {
            mockExpirations.set(key, Date.now() + (options.ex * 1000));
          }
          return 'OK';
        }),
        get: vi.fn().mockImplementation(async (key: string) => {
          const expiry = mockExpirations.get(key);
          if (expiry && expiry < Date.now()) {
            mockStore.delete(key);
            mockExpirations.delete(key);
            return null;
          }
          return mockStore.get(key) || null;
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
          const existed = mockStore.has(key);
          mockStore.delete(key);
          mockExpirations.delete(key);
          return existed ? 1 : 0;
        }),
        flushall: vi.fn().mockImplementation(async () => {
          mockStore.clear();
          mockExpirations.clear();
          return 'OK';
        })
      })
    }
  };
});

describe('CacheService', () => {
  let cacheService: CacheService;
  
  // Reset mocks before each test
  beforeEach(async () => {
    // Reset the logger mock to start fresh for each test
    mockLogger.reset();
    
    cacheService = new CacheService();
    
    // Access the Redis client and flush all data
    // @ts-ignore - redisPromise is private, but we need to wait for initialization
    const redis = await cacheService['redisPromise'];
    await redis.flushall();
  });
  
  describe('Basic operations', () => {
    it('should set and get a value', async () => {
      const key = 'test-key';
      const value = { hello: 'world' };
      
      await cacheService.set(key, value);
      const retrieved = await cacheService.get<typeof value>(key);
      
      // Verify the correct value was returned
      expect(retrieved).toEqual(value);
      
      // Verify appropriate logging occurred
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache'),
        expect.objectContaining({
          category: LOG_CATEGORIES.CACHE,
          operation: expect.stringContaining('set')
        })
      );
    });
    
    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non-existent-key');
      
      expect(result).toBeNull();
      
      // Verify cache miss was logged
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache miss'),
        expect.objectContaining({
          category: LOG_CATEGORIES.CACHE,
          key: 'non-existent-key'
        })
      );
    });
    
    it('should delete a value', async () => {
      const key = 'delete-test-key';
      
      await cacheService.set(key, 'test-value');
      await cacheService.delete(key);
      
      const result = await cacheService.get(key);
      expect(result).toBeNull();
      
      // Verify delete operation was logged
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache'),
        expect.objectContaining({
          category: LOG_CATEGORIES.CACHE,
          operation: expect.stringContaining('delete')
        })
      );
    });
    
    it('should respect TTL values', async () => {
      const key = 'expiring-key';
      const ttlSeconds = 1; // Set a short TTL for testing
      
      await cacheService.set(key, 'expiring-value', { ttl: ttlSeconds });
      
      // Value should exist initially
      let result = await cacheService.get(key);
      expect(result).toBe('expiring-value');
      
      // Wait for TTL to expire
      await sleep(ttlSeconds * 1000 + 100);
      
      // Value should be gone after TTL
      result = await cacheService.get(key);
      expect(result).toBeNull();
    });
  });
  
  describe('Domain-specific methods', () => {
    it('should set and get RAG results', async () => {
      const query = 'example RAG query';
      const results = { documents: [{ id: '1', content: 'test content' }] };
      const options = { tenantId: 'test' };
      
      await cacheService.setRagResults(query, results, options);
      const retrieved = await cacheService.getRagResults<typeof results>(query, options);
      
      expect(retrieved).toEqual(results);
      
      // Verify that specific RAG cache operations were logged
      expect(mockLogger.hasLogWithCategory('debug', LOG_CATEGORIES.CACHE)).toBe(true);
      expect(mockLogger.hasLogWithCategory('debug', LOG_CATEGORIES.RAG)).toBe(true);
    });
    
    it('should set and get scraped content', async () => {
      const url = 'https://example.com';
      const content = '<html><body>Test content</body></html>';
      
      await cacheService.setScrapedContent(url, content);
      const retrieved = await cacheService.getScrapedContent(url);
      
      expect(retrieved).toBe(content);
      
      // Verify appropriate logging for web scraper cache operations
      expect(mockLogger.hasLogWithCategory('debug', LOG_CATEGORIES.CACHE)).toBe(true);
      expect(mockLogger.hasLogWithCategory('debug', LOG_CATEGORIES.WEBSCRAPER)).toBe(true);
    });
    
    it('should normalize keys for case insensitivity', async () => {
      const query1 = 'Test Query';
      const query2 = 'test query';
      const results = { relevance: 0.95 };
      
      await cacheService.setRagResults(query1, results);
      const retrieved = await cacheService.getRagResults<typeof results>(query2);
      
      expect(retrieved).toEqual(results);
      
      // Check for key normalization in logs using getLogsContaining instead
      const normalizationLogs = mockLogger.getLogsContaining('normalized');
      expect(normalizationLogs.some((log: {message: string; metadata?: any}) => 
        log.message.includes('normalized') || 
        (log.metadata && log.metadata.normalizedKey !== undefined)
      )).toBe(true);
    });
    
    // Example test for error handling
    it('should log errors when Redis operations fail', async () => {
      // Mock Redis client to simulate error
      const redis = await cacheService['redisPromise'];
      const mockGetError = new Error('Redis connection error');
      
      // Save original implementation
      const originalGet = redis.get;
      
      // Override with implementation that throws
      redis.get = vi.fn().mockRejectedValue(mockGetError);
      
      // Attempt to get a value
      const result = await cacheService.get('error-key');
      
      // Should return null on error
      expect(result).toBeNull();
      
      // Verify error was logged appropriately
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache error'),
        expect.objectContaining({
          category: LOG_CATEGORIES.CACHE,
          error: expect.any(Error)
        })
      );
      
      // Restore original implementation
      redis.get = originalGet;
    });

    it('should log cache operation metrics', async () => {
      // Call get multiple times to trigger stats logging
      for (let i = 0; i < 25; i++) {
        await cacheService.get('test-key-' + i);
      }
      
      // Check for cache stats log
      const statsLogs = mockLogger.getLogsContaining('Cache stats');
      expect(statsLogs.length).toBeGreaterThan(0);
      
      // Verify cache hit/miss tracking in deep search methods
      await cacheService.getDeepSearchResults('test-query');
      
      // Use getLogsContaining instead of getLogsByCategory
      const deepSearchLogs = mockLogger.getLogsContaining('deep search query');
      expect(deepSearchLogs.some((log: {message: string}) => 
        log.message.includes('Cache miss for deep search query')
      )).toBe(true);
    });
  });
}); 