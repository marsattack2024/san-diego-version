import { config } from 'dotenv';
import { deepSearchTool, webSearchTool, combinedSearchTool } from './index';

// Load environment variables
config();

/**
 * Test function for the DeepSearch tool
 */
async function testDeepSearch() {
  console.log('Testing DeepSearch tool...');
  
  try {
    // Test the deep search tool
    console.log('\n--- Testing Deep Search ---');
    const deepSearchResult = await deepSearchTool.execute({ 
      query: 'What are the latest developments in AI in 2023?' 
    });
    console.log('Deep Search Result:');
    console.log(JSON.stringify(deepSearchResult, null, 2));
    
    // Test the web search tool
    console.log('\n--- Testing Web Search ---');
    const webSearchResult = await webSearchTool.execute({ 
      query: 'What are the latest developments in AI in 2023?' 
    });
    console.log('Web Search Result:');
    console.log(JSON.stringify(webSearchResult, null, 2));
    
    // Test the combined search tool
    console.log('\n--- Testing Combined Search ---');
    const combinedResult = await combinedSearchTool.execute({ 
      query: 'What are the latest developments in AI in 2023?' 
    });
    console.log('Combined Search Result:');
    console.log(JSON.stringify(combinedResult, null, 2));
    
  } catch (error) {
    console.error('Error testing search tools:', error);
  }
}

// Run the test
testDeepSearch()
  .then(() => console.log('Test completed'))
  .catch(error => console.error('Test failed:', error)); 