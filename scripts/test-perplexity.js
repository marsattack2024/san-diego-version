import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env and .env.local
dotenv.config();

// Try to load from .env.local if the key is not found
if (!process.env.PERPLEXITY_API_KEY) {
  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
      const perplexityKeyMatch = envLocalContent.match(/PERPLEXITY_API_KEY=(.+)/);
      
      if (perplexityKeyMatch && perplexityKeyMatch[1]) {
        process.env.PERPLEXITY_API_KEY = perplexityKeyMatch[1].trim();
        console.log('Loaded PERPLEXITY_API_KEY from .env.local');
      }
    }
  } catch (error) {
    console.error('Error loading .env.local:', error.message);
  }
}

/**
 * Test script for Perplexity API
 * This script demonstrates both regular and streaming API calls
 */

// Get API key from environment variables
const apiKey = process.env.PERPLEXITY_API_KEY;

if (!apiKey) {
  console.error('Error: Missing PERPLEXITY_API_KEY in environment variables');
  console.error('Please add it to your .env file or .env.local file or set it in your environment');
  console.error('You can copy the placeholder from .env.example');
  process.exit(1);
}

// Create OpenAI client with Perplexity base URL
const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.perplexity.ai',
});

// Test query
const testQuery = 'What are the latest developments in AI language models?';

// System prompt for research
const systemPrompt = 'You are a deep research agent. Please bring back comprehensive and relevant information. Focus on factual information, include specific details, and cite sources when possible.';

/**
 * Regular chat completion (non-streaming)
 */
async function chatCompletion() {
  console.log('\n=== Testing Regular Chat Completion ===');
  console.log(`Query: "${testQuery}"`);
  
  try {
    const startTime = performance.now();
    
    // Prepare messages for the API call
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: testQuery
      }
    ];
    
    // Make the API call
    console.log('Sending request to Perplexity API...');
    const response = await client.chat.completions.create({
      model: 'sonar-pro',
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
    
    return response;
  } catch (error) {
    console.error('Error in chat completion:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

/**
 * Streaming chat completion
 */
async function chatCompletionStream() {
  console.log('\n=== Testing Streaming Chat Completion ===');
  console.log(`Query: "${testQuery}"`);
  
  try {
    // Prepare messages for the API call
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: testQuery
      }
    ];
    
    // Make the streaming API call
    console.log('Sending streaming request to Perplexity API...');
    const stream = await client.chat.completions.create({
      model: 'sonar-pro',
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
    return fullResponse;
  } catch (error) {
    console.error('Error in streaming chat completion:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run both tests
async function runTests() {
  try {
    console.log('Starting Perplexity API tests...');
    
    // Test regular completion
    await chatCompletion();
    
    // Test streaming completion
    await chatCompletionStream();
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Unhandled error in tests:', error);
  }
}

// Execute tests
runTests(); 