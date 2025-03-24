#!/usr/bin/env node

/**
 * Test script for the serverless Perplexity API endpoint
 * Run with: node scripts/test-perplexity-serverless.js
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
}

// Test the serverless Perplexity API endpoint
async function testServerlessPerplexityAPI() {
  console.log('\n=== Testing Serverless Perplexity API Endpoint ===');
  
  // Get the base URL for local development server
  const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const apiUrl = `${baseUrl}/api/perplexity`;
  const TEST_QUERY = 'What are the latest developments in AI language models?';
  
  console.log(`API URL: ${apiUrl}`);
  console.log(`Query: "${TEST_QUERY}"`);
  
  const startTime = performance.now();
  
  try {
    const requestBody = {
      query: TEST_QUERY
    };
    
    console.log('Sending request to serverless Perplexity API endpoint...');
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`API returned error: ${result.error}`);
    }
    
    const data = result.data;
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
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Error testing serverless Perplexity API:', error.message);
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
  await testServerlessPerplexityAPI();
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 