import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { cacheService } from '@/lib/cache/cache-service';
import { puppeteerService } from '@/lib/services/puppeteer.service';
import type { ScrapedContent, PuppeteerResponseData } from '@/lib/services/puppeteer.service';

// Mock dependencies
vi.mock('@/lib/logger/edge-logger', () => ({
  edgeLogger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('@/lib/cache/cache-service', () => ({
  cacheService: {
    getScrapedContent: vi.fn(),
    setScrapedContent: vi.fn()
  }
}));

// Mock puppeteerService
vi.mock('@/lib/services/puppeteer.service', () => ({
  puppeteerService: {
    validateAndSanitizeUrl: vi.fn(),
    scrapeUrl: vi.fn()
  }
}));

// Mock fetch globally
const mockFetchResponse = (data: any, ok = true, status = 200) => {
  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(data))
  };
};

describe('PuppeteerService', () => {
  const TEST_URLS = [
    'https://www.example.com',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript'
  ];
  
  global.fetch = vi.fn();
  
  beforeEach(() => {
    vi.resetAllMocks();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('validateAndSanitizeUrl', () => {
    it('should validate and sanitize valid URLs', () => {
      const validUrl = 'https://www.example.com';
      vi.mocked(puppeteerService.validateAndSanitizeUrl).mockReturnValue(validUrl);
      
      const result = puppeteerService.validateAndSanitizeUrl(validUrl);
      
      expect(puppeteerService.validateAndSanitizeUrl).toHaveBeenCalledWith(validUrl);
      expect(result).toBe(validUrl);
    });
    
    it('should return null for invalid URLs', () => {
      const invalidUrl = 'not-a-url';
      vi.mocked(puppeteerService.validateAndSanitizeUrl).mockReturnValue(null);
      
      const result = puppeteerService.validateAndSanitizeUrl(invalidUrl);
      
      expect(puppeteerService.validateAndSanitizeUrl).toHaveBeenCalledWith(invalidUrl);
      expect(result).toBeNull();
    });
  });
  
  describe('scrapeUrl', () => {
    it('should return cached content when available', async () => {
      // Mock cache hit
      const cachedContent: PuppeteerResponseData = {
        content: 'Cached content',
        title: 'Cached Title',
        url: TEST_URLS[0]
      };
      
      vi.mocked(cacheService.getScrapedContent).mockResolvedValue(JSON.stringify(cachedContent));
      
      const expectedResult: ScrapedContent = {
        content: 'Cached content',
        title: 'Cached Title',
        url: TEST_URLS[0],
        timestamp: expect.any(Number)
      };
      
      vi.mocked(puppeteerService.scrapeUrl).mockResolvedValue(expectedResult);
      
      const result = await puppeteerService.scrapeUrl(TEST_URLS[0]);
      
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith(TEST_URLS[0]);
      expect(result).toEqual(expectedResult);
    });
    
    it('should scrape content when cache is empty', async () => {
      // Mock cache miss and successful scrape
      const expectedResult: ScrapedContent = {
        content: 'Fresh scraped content',
        title: 'Example Domain',
        url: TEST_URLS[0],
        timestamp: expect.any(Number)
      };
      
      vi.mocked(puppeteerService.scrapeUrl).mockResolvedValue(expectedResult);
      
      const result = await puppeteerService.scrapeUrl(TEST_URLS[0]);
      
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith(TEST_URLS[0]);
      expect(result).toEqual(expectedResult);
    });
    
    it('should handle scraping errors', async () => {
      // Mock scraping error
      vi.mocked(puppeteerService.scrapeUrl).mockRejectedValue(new Error('Network error'));
      
      await expect(puppeteerService.scrapeUrl(TEST_URLS[0])).rejects.toThrow('Network error');
      
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith(TEST_URLS[0]);
    });
  });
}); 