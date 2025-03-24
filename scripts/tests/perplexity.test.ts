// Import environment variables first - this must be the first import
import '../lib/env-loader';

import { runTest, runTests } from '../lib/test-utils';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';

// Test query
const TEST_QUERY = 'What are the latest developments in AI language models?';

// System prompt for research
const SYSTEM_PROMPT = 'You are a deep research agent. Please bring back comprehensive and relevant information. Focus on factual information, include specific details, and cite sources when possible.';

/**
 * Initialize the Perplexity API client
 */
function initializeClient(): OpenAI | null {
  // Get API key from environment variables
  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.error('Error: Missing PERPLEXITY_API_KEY in environment variables');
    console.error('Please add it to your .env file or set it in your environment');
    return null;
  }

  // Create OpenAI client with Perplexity base URL
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.perplexity.ai',
  });
}

/**
 * Test for regular chat completion (non-streaming)
 */
async function testChatCompletion(): Promise<void> {
  console.log('\n=== Testing Regular Chat Completion ===');
  console.log(`Query: "${TEST_QUERY}"`);
  
  const client = initializeClient();
  if (!client) {
    console.log('Skipping test due to missing API key');
    return;
  }
  
  try {
    const startTime = performance.now();
    
    // Prepare messages for the API call
    const messages = [
      {
        role: 'system' as const,
        content: SYSTEM_PROMPT
      },
      {
        role: 'user' as const,
        content: TEST_QUERY
      }
    ];
    
    // Make the API call
    console.log('Sending request to Perplexity API...');
    const response = await client.chat.completions.create({
      model: 'sonar',
      messages,
    });
    
    const endTime = performance.now();
    const executionTime = Math.round(endTime - startTime);
    
    console.log('\n=== Response ===');
    console.log('Content:', response.choices[0]?.message?.content);
    console.log('\n=== Metadata ===');
    console.log('Model:', response.model);
    console.log('Usage:', JSON.stringify(response.usage, null, 2));
    console.log('Execution time:', executionTime, 'ms');
    
  } catch (error: any) {
    console.error('Error in chat completion:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Test for streaming chat completion
 */
async function testChatCompletionStream(): Promise<void> {
  console.log('\n=== Testing Streaming Chat Completion ===');
  console.log(`Query: "${TEST_QUERY}"`);
  
  const client = initializeClient();
  if (!client) {
    console.log('Skipping test due to missing API key');
    return;
  }
  
  try {
    // Prepare messages for the API call
    const messages = [
      {
        role: 'system' as const,
        content: SYSTEM_PROMPT
      },
      {
        role: 'user' as const,
        content: TEST_QUERY
      }
    ];
    
    // Make the streaming API call
    console.log('Sending streaming request to Perplexity API...');
    const stream = await client.chat.completions.create({
      model: 'sonar',
      messages,
      stream: true,
    });
    
    console.log('\n=== Streaming Response ===');
    let fullResponse = '';
    
    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        process.stdout.write(content);
        fullResponse += content;
      }
    }
    
    console.log('\n\n=== Streaming completed ===');
    
  } catch (error: any) {
    console.error('Error in streaming chat completion:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Main function to run all Perplexity API tests
 */
async function main(): Promise<void> {
  await runTests([
    { name: 'Regular Chat Completion', fn: testChatCompletion },
    { name: 'Streaming Chat Completion', fn: testChatCompletionStream }
  ]);
}

// Run the tests if this module is being executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

// Export the tests for use in other test runners
export const tests = [
  { name: 'Regular Chat Completion', fn: testChatCompletion },
  { name: 'Streaming Chat Completion', fn: testChatCompletionStream }
]; 