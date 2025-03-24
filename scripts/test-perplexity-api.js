#!/usr/bin/env node

/**
 * Simple script to test Perplexity API connectivity
 * Run with: node scripts/test-perplexity-api.js
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Setup for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Load environment variables
function loadEnv() {
  const localEnvPath = resolve(rootDir, '.env.local');
  const defaultEnvPath = resolve(rootDir, '.env');
  
  const envPath = existsSync(localEnvPath) ? localEnvPath : defaultEnvPath;
  
  if (!existsSync(envPath)) {
    console.error(`Error: No .env file found at ${envPath}`);
    process.exit(1);
  }
  
  const result = config({ path: envPath });
  
  if (result.error) {
    console.error('Error loading environment variables:', result.error);
    process.exit(1);
  }
  
  console.log(`Loaded environment from ${envPath}`);
  
  if (!process.env.PERPLEXITY_API_KEY) {
    console.error('Error: PERPLEXITY_API_KEY is not set in environment variables');
    process.exit(1);
  }
}

// Test the Perplexity API with direct fetch call
async function testPerplexityAPI() {
  console.log('\n=== Testing Perplexity API ===');
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const API_URL = 'https://api.perplexity.ai/chat/completions';
  const TEST_QUERY = 'What are the latest developments in AI language models?';
  
  console.log(`API Key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
  console.log(`Query: "${TEST_QUERY}"`);
  
  const startTime = performance.now();
  
  try {
    const requestBody = {
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: TEST_QUERY
        }
      ],
      temperature: 0.5,
      max_tokens: 1000,
      stream: false
    };
    
    console.log('Sending request to Perplexity API...');
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || 'No content returned';
    
    const endTime = performance.now();
    const executionTime = Math.round(endTime - startTime);
    
    console.log('\n=== Response ===');
    console.log('Status:', response.status);
    console.log('Content Length:', content.length);
    console.log('Content Preview:', content.substring(0, 100) + '...');
    console.log('\n=== Metadata ===');
    console.log('Model:', data.model);
    console.log('Usage:', data.usage);
    console.log('Execution time:', executionTime, 'ms');
    
    console.log('\n=== Full Response Object ===');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Error testing Perplexity API:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Main function
async function main() {
  // Load environment
  loadEnv();
  
  // Test the API
  await testPerplexityAPI();
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 