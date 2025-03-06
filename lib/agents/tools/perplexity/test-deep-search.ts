import { config } from 'dotenv';
import { deepSearchTool } from '.';

// Load environment variables
config();

/**
 * Test function for the DeepSearch tool
 */
async function testDeepSearch() {
  console.log('Testing Deep Search Tool...');
  
  const query = 'What are the latest advancements in quantum computing?';
  console.log(`Query: "${query}"`);
  
  try {
    const result = await deepSearchTool.execute({ query });
    console.log('Result:', result);
    
    if (result.success) {
      console.log('\nContent:');
      console.log(result.content);
    }
  } catch (error) {
    console.error('Error testing deep search:', error);
  }
}

// Run the test
testDeepSearch()
  .then(() => console.log('Test completed'))
  .catch(error => console.error('Test failed:', error)); 