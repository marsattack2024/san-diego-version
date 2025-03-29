import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks before importing modules that use them
setupLoggerMock();

// Mock the Perplexity service
vi.mock('@/lib/services/perplexity.service', () => ({
  perplexityService: {
    initialize: vi.fn().mockReturnValue({ isReady: true }),
    search: vi.fn()
  }
}));

// Now import the modules that depend on the mocks
import { deepSearchTool } from '@/lib/chat-engine/tools/deep-search';
import { perplexityService } from '@/lib/services/perplexity.service';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

describe('Deep Search Tool', () => {
  const SAMPLE_SEARCH_TERM = 'What is AI?';
  const SAMPLE_FORMATTED_QUERY = 'What is AI?';
  const SAMPLE_FORMATTED_RESULT = 'AI stands for artificial intelligence...';

  // Mock runOptions for tool execution
  const mockRunOptions = {
    toolCallId: 'tool-call-123',
    body: { deepSearchEnabled: true },
    messages: []
  };

  beforeEach(() => {
    // Reset all mocks before each test
    mockLogger.reset();
    vi.mocked(perplexityService.initialize).mockClear();
    vi.mocked(perplexityService.search).mockClear();

    // Default mock implementation for successful search
    vi.mocked(perplexityService.initialize).mockReturnValue({ isReady: true });
    vi.mocked(perplexityService.search).mockResolvedValue({
      content: SAMPLE_FORMATTED_RESULT,
      model: 'sonar',
      timing: { total: 500 }
    });
  });

  describe('execute', () => {
    it('should perform a search and return the result', async () => {
      // Execute the deep search tool
      const result = await deepSearchTool.execute({ search_term: SAMPLE_SEARCH_TERM }, mockRunOptions);

      // Verify Perplexity service was initialized
      expect(perplexityService.initialize).toHaveBeenCalled();

      // Verify search was performed with formatted query
      expect(perplexityService.search).toHaveBeenCalledWith(SAMPLE_FORMATTED_QUERY);

      // Verify correct result was returned
      expect(result).toBe(SAMPLE_FORMATTED_RESULT);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deep Search started',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'deep_search_started',
          toolCallId: 'tool-call-123',
          originalQuery: SAMPLE_SEARCH_TERM,
          formattedQuery: SAMPLE_FORMATTED_QUERY
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deep Search completed successfully',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'deep_search_success',
          responseLength: SAMPLE_FORMATTED_RESULT.length
        })
      );
    });

    it('should format the search query correctly', async () => {
      // Test various query formats
      const testCases = [
        // Short query - should add comprehensive information request
        {
          input: 'AI',
          expected: 'AI - provide comprehensive information'
        },
        // Query that looks like a question without punctuation - should add question mark
        {
          input: 'what is machine learning',
          expected: 'what is machine learning?'
        },
        // Query that already has punctuation - should not change
        {
          input: 'Explain neural networks.',
          expected: 'Explain neural networks.'
        },
        // Query with extra whitespace - should trim
        {
          input: '  deep learning trends   ',
          expected: 'deep learning trends'
        }
      ];

      for (const testCase of testCases) {
        // Reset search mock for each test case
        vi.mocked(perplexityService.search).mockClear();

        // Execute deep search
        await deepSearchTool.execute({ search_term: testCase.input }, mockRunOptions);

        // Verify formatted query was passed to search
        expect(perplexityService.search).toHaveBeenCalledWith(testCase.expected);
      }
    });

    it('should handle errors from Perplexity service', async () => {
      // Mock a search error
      const testError = new Error('API connection failed');
      vi.mocked(perplexityService.search).mockRejectedValueOnce(testError);

      // Execute deep search
      const result = await deepSearchTool.execute({ search_term: SAMPLE_SEARCH_TERM }, mockRunOptions);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deep Search error',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'deep_search_error',
          errorMessage: 'API connection failed',
          searchTerm: SAMPLE_SEARCH_TERM,
          important: true
        })
      );

      // Verify user-friendly error message was returned
      expect(result).toContain('I encountered an error while searching for information');
      expect(result).toContain('API connection failed');
    });

    it('should handle case when Perplexity client is not ready', async () => {
      // Mock client initialization failure
      vi.mocked(perplexityService.initialize).mockReturnValueOnce({ isReady: false });

      // Execute deep search
      const result = await deepSearchTool.execute({ search_term: SAMPLE_SEARCH_TERM }, mockRunOptions);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deep Search error',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'deep_search_error',
          errorMessage: 'Perplexity API client is not ready'
        })
      );

      // Verify search was not attempted
      expect(perplexityService.search).not.toHaveBeenCalled();

      // Verify user-friendly error message was returned
      expect(result).toContain('I encountered an error while searching for information');
      expect(result).toContain('Perplexity API client is not ready');
    });

    it('should log detailed debug information', async () => {
      // Execute deep search
      await deepSearchTool.execute({ search_term: SAMPLE_SEARCH_TERM }, mockRunOptions);

      // Verify detailed debug logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deep Search complete runOptions debug',
        expect.objectContaining({
          category: LOG_CATEGORIES.TOOLS,
          operation: 'deep_search_debug',
          toolCallId: 'tool-call-123',
          runOptionsKeys: expect.any(Array),
          bodyKeys: expect.any(Array),
          deepSearchEnabledInBody: true
        })
      );
    });
  });
}); 