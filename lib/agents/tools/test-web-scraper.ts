import { webScraperTool } from './web-scraper-tool';
import type { ToolExecutionOptions } from 'ai';

// Create a simple logger
const logger = {
  info: (message: string, data?: any) => console.log(`[INFO] ${message}`, data || ''),
  error: (message: string, data?: any) => console.error(`[ERROR] ${message}`, data || '')
};

/**
 * Test the web scraper tool with a specific URL
 */
export async function testWebScraper() {
  logger.info('Testing web scraper tool');

  try {
    // Create minimal ToolExecutionOptions object with required fields
    const options: ToolExecutionOptions = {
      toolCallId: 'test-call-id',
      messages: []
    };

    // Test with a specific URL
    const result = await webScraperTool.execute(
      { url: 'https://www.example.com' },
      options
    );
    logger.info('Web scraper result', { result });

    return result;
  } catch (error) {
    logger.error('Error testing web scraper', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testWebScraper().catch(error => {
    logger.error('Unhandled error in test', { error });
    process.exit(1);
  });
} 