import { chatTools } from '../lib/chat/tools';
import dotenv from 'dotenv';
import { ToolExecutionOptions } from 'ai';

// Load environment variables
dotenv.config();

async function testChatTools() {
  console.log('Testing chat tools...');

  // Create a mock tool execution options
  const mockToolOptions: ToolExecutionOptions = {
    toolCallId: 'test-tool-call-id',
    messages: []
  };

  // Test deep search tool
  console.log('\n--- Testing Deep Search Tool ---');
  console.log('Deep search functionality has been removed.');
  /*
  try {
    console.log('Executing deep search...');
    const deepSearchResult = await chatTools.deepSearch.execute({ 
      query: 'Latest developments in AI language models' 
    }, mockToolOptions);
    console.log('Deep search result:', deepSearchResult);
  } catch (error) {
    console.error('Deep search test failed:', error);
  }
  */

  // Test web scraper tool
  console.log('\n--- Testing Web Scraper Tool ---');
  try {
    console.log('Executing web scraper...');
    const webScraperResult = await chatTools.webScraper.execute({
      url: 'https://www.example.com'
    }, mockToolOptions);
    console.log('Web scraper result:', webScraperResult);
  } catch (error) {
    console.error('Web scraper test failed:', error);
  }

  // Test URL detection tool
  console.log('\n--- Testing URL Detection Tool ---');
  try {
    console.log('Executing URL detection...');
    const urlDetectionResult = await chatTools.detectAndScrapeUrls.execute({
      text: 'Check out this website: https://www.example.com and also https://www.mozilla.org'
    }, mockToolOptions);
    console.log('URL detection result:', urlDetectionResult);
  } catch (error) {
    console.error('URL detection test failed:', error);
  }

  console.log('\nAll tests completed.');
}

// Run the tests
testChatTools().catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
}); 