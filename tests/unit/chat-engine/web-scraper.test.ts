import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Set up mocks before importing modules that use them
setupLoggerMock();

// Mock dependencies that the web scraper tool uses
vi.mock('@/lib/utils/url-utils', () => ({
  extractUrls: vi.fn(),
  validateAndSanitizeUrl: vi.fn().mockImplementation((url) => {
    if (url.includes('invalid')) return null;
    return url;
  })
}));

vi.mock('@/lib/services/puppeteer.service', () => ({
  puppeteerService: {
    scrapeUrl: vi.fn()
  }
}));

// Import the module under test (after setting up mocks)
import { createWebScraperTool, scrapeWebContentTool } from '@/lib/tools/web-scraper.tool';
import { puppeteerService } from '@/lib/services/puppeteer.service';
import { extractUrls } from '@/lib/utils/url-utils';

describe('Web Scraper Tool', () => {
  // Sample data for tests
  const sampleScrapedContent = {
    content: 'This is the content from the webpage',
    title: 'Example Website',
    url: 'https://example.com',
    timestamp: Date.now()
  };

  const sampleToolCallId = 'tool-call-123';
  const sampleQuery = 'Check out https://example.com for more information';

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
    mockLogger.reset();

    // Default mock implementation for puppeteerService.scrapeUrl
    vi.mocked(puppeteerService.scrapeUrl).mockResolvedValue(sampleScrapedContent);

    // Setup default URL extraction behavior
    vi.mocked(extractUrls).mockImplementation((query) => {
      if (query.includes('example.com')) return ['https://example.com'];
      if (query.includes('multiple')) return ['https://example1.com', 'https://example2.com'];
      return [];
    });
  });

  describe('Tool Creation', () => {
    it('should create a web scraper tool with default options', () => {
      const tool = createWebScraperTool();

      // Verify the tool has the expected structure
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
    });

    it('should create a web scraper tool with custom options', () => {
      const tool = createWebScraperTool({
        timeout: 5000,
        maxUrlsToProcess: 2,
        operationName: 'custom_scraper'
      });

      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
    });
  });

  describe('URL Extraction', () => {
    it('should extract URLs from the query', async () => {
      // Execute the tool
      await scrapeWebContentTool.execute({ url: sampleQuery }, {
        toolCallId: sampleToolCallId,
        messages: [{ role: 'user', content: sampleQuery }]
      });

      // Verify URL extraction was called
      expect(extractUrls).toHaveBeenCalledWith(sampleQuery);
    });

    it('should use provided URLs instead of extracting from query', async () => {
      const specificUrls = ['https://specific-example.com'];

      // Execute the tool with specific URLs
      await scrapeWebContentTool.execute(
        { url: specificUrls[0] },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: 'irrelevant query' }]
        }
      );

      // Verify URL extraction was NOT called
      expect(extractUrls).not.toHaveBeenCalled();

      // Verify puppeteerService was called with the specific URL
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith(specificUrls[0]);
    });

    it('should handle case when no URLs are found', async () => {
      // Explicitly set the extractUrls mock to return an empty array
      vi.mocked(extractUrls).mockReturnValue([]);

      // Execute with a query that won't have URLs
      const result = await scrapeWebContentTool.execute(
        { url: 'query with no urls' },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: 'query with no urls' }]
        }
      );

      // Verify we get an appropriate response
      expect(result).toContain('No URLs were found to scrape');

      // Verify puppeteerService was not called
      expect(puppeteerService.scrapeUrl).not.toHaveBeenCalled();

      // Verify appropriate logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No URLs found to scrape',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          toolCallId: sampleToolCallId
        })
      );
    });
  });

  describe('URL Processing', () => {
    it('should process multiple URLs up to the limit', async () => {
      // Set up the mock to return multiple URLs
      const queryWithMultipleUrls = 'Check out multiple sites: https://example1.com and https://example2.com';
      vi.mocked(extractUrls).mockReturnValue(['https://example1.com', 'https://example2.com']);

      // Execute the tool
      await scrapeWebContentTool.execute(
        { url: queryWithMultipleUrls },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: queryWithMultipleUrls }]
        }
      );

      // Verify that scrapeUrl was called for each URL
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledTimes(2);
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith('https://example1.com');
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith('https://example2.com');

      // Verify appropriate logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing URLs',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          urlCount: 2,
          urls: ['https://example1.com', 'https://example2.com']
        })
      );
    });

    it('should limit the number of URLs processed to maxUrlsToProcess', async () => {
      // Create a tool with a smaller URL limit
      const toolWithLowerLimit = createWebScraperTool({ maxUrlsToProcess: 1 });

      // Set up the mock to return multiple URLs
      const queryWithMultipleUrls = 'Check out multiple sites: https://example1.com and https://example2.com';
      vi.mocked(extractUrls).mockReturnValue(['https://example1.com', 'https://example2.com']);

      // Execute the tool
      await toolWithLowerLimit.execute(
        { url: queryWithMultipleUrls },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: queryWithMultipleUrls }]
        }
      );

      // Verify that scrapeUrl was only called for the first URL
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledTimes(1);
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledWith('https://example1.com');

      // Verify we did not process the second URL
      expect(puppeteerService.scrapeUrl).not.toHaveBeenCalledWith('https://example2.com');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in scrapeUrl for individual URLs', async () => {
      // Set up the mock to return multiple URLs
      const queryWithMultipleUrls = 'Check out multiple sites: https://example1.com and https://example2.com';
      vi.mocked(extractUrls).mockReturnValue(['https://example1.com', 'https://example2.com']);

      // Make the first URL fail
      vi.mocked(puppeteerService.scrapeUrl).mockImplementation(async (url) => {
        if (url === 'https://example1.com') {
          throw new Error('Failed to scrape');
        }
        return sampleScrapedContent;
      });

      // Execute the tool
      const result = await scrapeWebContentTool.execute(
        { url: queryWithMultipleUrls },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: queryWithMultipleUrls }]
        }
      );

      // Verify that we continued processing despite the error
      expect(puppeteerService.scrapeUrl).toHaveBeenCalledTimes(2);

      // Verify the error was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to scrape URL'),
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          url: 'https://example1.com',
          error: 'Failed to scrape'
        })
      );

      // Verify the result includes both the error and successful content
      expect(result).toContain('Failed to scrape https://example1.com');
      expect(result).toContain('This is the content from the webpage');
    });

    it('should handle fatal errors in the tool execution', async () => {
      // Simulate a catastrophic error
      vi.mocked(extractUrls).mockImplementation(() => {
        throw new Error('Fatal error');
      });

      // Execute the tool
      const result = await scrapeWebContentTool.execute(
        { url: sampleQuery },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: sampleQuery }]
        }
      );

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Web scraping failed',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          error: 'Fatal error'
        })
      );

      // Verify the result contains error information
      expect(result).toContain('Error scraping web content');
      expect(result).toContain('Fatal error');
    });
  });

  describe('Result Formatting', () => {
    it('should format successful results properly', async () => {
      // Setup the mock response
      vi.mocked(extractUrls).mockReturnValue(['https://example.com']);
      vi.mocked(puppeteerService.scrapeUrl).mockResolvedValue({
        content: 'Test content',
        title: 'Test Title',
        url: 'https://example.com',
        timestamp: Date.now()
      });

      // Execute the tool
      const result = await scrapeWebContentTool.execute(
        { url: sampleQuery },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: sampleQuery }]
        }
      );

      // Verify the formatted content
      expect(result).toContain('## Test Title ✓');
      expect(result).toContain('URL: https://example.com');
      expect(result).toContain('Test content');

      // Verify the metadata
      expect(result).toContain('No URLs processed');
      expect(result).toContain('1 URL processed');
      expect(result).toContain('1 URL failed');
      expect(result).toContain('0.00% success rate');
    });

    it('should combine content from multiple URLs correctly', async () => {
      // Set up multiple URLs
      vi.mocked(extractUrls).mockReturnValue(['https://example1.com', 'https://example2.com']);

      // Set up different responses for each URL
      vi.mocked(puppeteerService.scrapeUrl).mockImplementation(async (url) => {
        if (url === 'https://example1.com') {
          return {
            content: 'Content from site 1',
            title: 'Site 1',
            url: 'https://example1.com',
            timestamp: Date.now()
          };
        } else {
          return {
            content: 'Content from site 2',
            title: 'Site 2',
            url: 'https://example2.com',
            timestamp: Date.now()
          };
        }
      });

      // Execute the tool with multiple URLs
      const result = await scrapeWebContentTool.execute(
        { url: 'Check out multiple sites' },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: 'Check out multiple sites' }]
        }
      );

      // Verify the formatted content includes both sites separated by dividers
      expect(result).toContain('## Site 1 ✓');
      expect(result).toContain('URL: https://example1.com');
      expect(result).toContain('Content from site 1');

      expect(result).toContain('## Site 2 ✓');
      expect(result).toContain('URL: https://example2.com');
      expect(result).toContain('Content from site 2');

      // Check for separator
      expect(result).toContain('---');
    });
  });

  describe('Logging', () => {
    it('should log the start and completion of scraping', async () => {
      // Setup to return a URL for scraping
      vi.mocked(extractUrls).mockReturnValue(['https://example.com']);

      // Execute the tool
      await scrapeWebContentTool.execute(
        { url: sampleQuery },
        {
          toolCallId: sampleToolCallId,
          messages: [{ role: 'user', content: sampleQuery }]
        }
      );

      // Verify start log
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Web scraper started',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'web_scraper',
          toolCallId: sampleToolCallId,
          url: sampleQuery
        })
      );

      // Verify completion log
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Web scraping completed',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'web_scraper',
          toolCallId: sampleToolCallId,
          urlCount: 1,
          successCount: 1
        })
      );
    });
  });
}); 