import { webScraperTool, urlDetectionTool } from './web-scraper-tool';
import { createLogger } from '../../utils/client-logger';

const logger = createLogger('test:web-scraper');

/**
 * Test the web scraper tool with a specific URL
 */
async function testWebScraper() {
  logger.info('Testing web scraper tool');
  
  try {
    // Test with a specific URL
    const result = await webScraperTool.execute({ url: 'https://www.example.com' });
    logger.info('Web scraper result', { result });
    
    // Test URL detection
    const detectionResult = await urlDetectionTool.execute({ 
      text: 'Check out this website: https://www.example.com and also www.mozilla.org' 
    });
    logger.info('URL detection result', { detectionResult });
    
    logger.info('Tests completed successfully');
  } catch (error) {
    logger.error('Test failed', { error });
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testWebScraper().catch(error => {
    logger.error('Unhandled error in test', { error });
    process.exit(1);
  });
}

export { testWebScraper }; 