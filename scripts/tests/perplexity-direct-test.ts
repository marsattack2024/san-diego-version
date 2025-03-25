/**
 * Perplexity API Direct Test Script
 * Tests direct integration with the Perplexity API
 */

import { env } from '../lib/env-loader';
import { fileURLToPath } from 'url';

/**
 * Test direct calls to the Perplexity API
 */
async function testPerplexityDirectAPI(): Promise<void> {
  console.log('🔮 Testing Perplexity API Direct Integration');
  console.log('=========================================');
  
  const startTime = performance.now();
  const operationId = `perplexity-direct-test-${Date.now().toString(36)}`;
  
  // Check for API key
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ PERPLEXITY_API_KEY not configured in environment variables');
    return;
  }
  
  console.log('✅ API Key found');
  console.log(`  • Key format: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
  
  try {
    const API_URL = 'https://api.perplexity.ai/chat/completions';
    const testQuery = "What is the current time in San Diego?";
    
    // Create request with web_search_options
    const requestBody = {
      model: 'sonar',
      messages: [{ role: 'user', content: testQuery }],
      temperature: 0.5,
      max_tokens: 500,
      stream: false,
      web_search_options: {
        search_context_size: 'high'
      }
    };
    
    // Use consistent headers with User-Agent
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'Mozilla/5.0 SanDiego/1.0'
    };
    
    console.log('\n📤 Sending request to Perplexity API');
    console.log(`  • URL: ${API_URL}`);
    console.log(`  • Query: "${testQuery}"`);
    console.log(`  • Model: ${requestBody.model}`);
    console.log(`  • Headers: ${Object.keys(headers).join(', ')}`);
    
    console.log('\n⏳ Waiting for response...');
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    const statusCode = response.status;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    
    let responseBody;
    try {
      if (response.ok) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
    } catch (e) {
      responseBody = 'Error parsing response';
    }
    
    const duration = Math.round(performance.now() - startTime);
    
    console.log('\n📥 Perplexity API Response:');
    console.log(`  • Status: ${statusCode} (${response.statusText})`);
    console.log(`  • Duration: ${duration}ms`);
    console.log(`  • Response Headers: ${Object.keys(responseHeaders).join(', ')}`);
    
    if (response.ok) {
      console.log('\n✨ Response Body:');
      if (responseBody.choices && responseBody.choices.length > 0) {
        const content = responseBody.choices[0].message.content;
        console.log(`  • Content: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
        console.log(`  • Finish Reason: ${responseBody.choices[0].finish_reason}`);
        
        if (responseBody.usage) {
          console.log('\n📊 Token Usage:');
          console.log(`  • Prompt Tokens: ${responseBody.usage.prompt_tokens}`);
          console.log(`  • Completion Tokens: ${responseBody.usage.completion_tokens}`);
          console.log(`  • Total Tokens: ${responseBody.usage.total_tokens}`);
        }
      } else {
        console.log(JSON.stringify(responseBody, null, 2));
      }
    } else {
      console.error('\n❌ Error Response:');
      console.error(responseBody);
    }
    
    console.log('\n✅ Perplexity API test completed');
    return responseBody;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Math.round(performance.now() - startTime);
    
    console.error(`\n❌ Error testing Perplexity API: ${errorMessage}`);
    console.error(`  • Duration: ${duration}ms`);
    throw error;
  }
}

// Run the test if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testPerplexityDirectAPI().catch(err => {
    console.error('❌ Perplexity direct API test failed:', err);
    process.exit(1);
  });
}

// Export for use in the test runner
export const tests = [
  { name: 'Perplexity Direct API', fn: testPerplexityDirectAPI }
]; 