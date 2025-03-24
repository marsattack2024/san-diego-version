import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// No runtime declaration means this runs as serverless

export async function GET(req: NextRequest) {
  const startTime = performance.now();
  const operationId = `perplexity-test-${Date.now().toString(36)}`;
  
  edgeLogger.info('Testing Perplexity API directly', { 
    operation: 'api_perplexity_test',
    operationId,
    important: true
  });
  
  // Check for API key
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'PERPLEXITY_API_KEY not configured',
      hasKey: false
    }, { status: 500 });
  }
  
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
    
    edgeLogger.info('Sending test request to Perplexity API', {
      operation: 'api_perplexity_request',
      operationId,
      url: API_URL,
      requestBodyLength: JSON.stringify(requestBody).length,
      query: testQuery,
      headers: Object.keys(headers)
    });
    
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
    
    edgeLogger.info('Perplexity API test response', {
      operation: 'api_perplexity_response',
      operationId,
      status: statusCode,
      ok: response.ok,
      durationMs: duration,
      important: true
    });
    
    return NextResponse.json({
      success: response.ok,
      status: statusCode,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      durationMs: duration,
      runtime: 'edge',
      apiKeyPrefix: apiKey.substring(0, 5),
      apiKeySuffix: apiKey.substring(apiKey.length - 5)
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Math.round(performance.now() - startTime);
    
    edgeLogger.error('Error testing Perplexity API', {
      operation: 'api_perplexity_error',
      operationId,
      error: errorMessage,
      durationMs: duration,
      important: true
    });
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      durationMs: duration,
      runtime: 'edge',
      hasKey: true,
      apiKeyPrefix: apiKey.substring(0, 5),
      apiKeySuffix: apiKey.substring(apiKey.length - 5)
    }, { status: 500 });
  }
} 