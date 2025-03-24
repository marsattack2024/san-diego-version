import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Important: No runtime declaration means this runs as a serverless function

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const operationId = `perplexity-serverless-${Date.now().toString(36)}`;
  
  edgeLogger.info('Perplexity serverless function called', { 
    operation: 'perplexity_serverless_call',
    operationId,
    important: true
  });
  
  // Parse the request body
  let body;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid request body'
    }, { status: 400 });
  }
  
  // Get the query from the request body
  const { query } = body;
  if (!query || typeof query !== 'string') {
    return NextResponse.json({
      success: false,
      error: 'Query parameter is required'
    }, { status: 400 });
  }
  
  // Check for API key
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'PERPLEXITY_API_KEY not configured'
    }, { status: 500 });
  }
  
  try {
    const API_URL = 'https://api.perplexity.ai/chat/completions';
    
    // Create request with web_search_options
    const model = process.env.PERPLEXITY_MODEL || 'sonar';
    const requestBody = {
      model,
      messages: [{ role: 'user', content: query }],
      temperature: 0.5,
      max_tokens: 1000,
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
    
    edgeLogger.info('Sending request to Perplexity API (serverless)', {
      operation: 'perplexity_serverless_request',
      operationId,
      url: API_URL,
      model,
      queryLength: query.length
    });
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    const statusCode = response.status;
    
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
    
    edgeLogger.info('Perplexity API response (serverless)', {
      operation: 'perplexity_serverless_response',
      operationId,
      status: statusCode,
      ok: response.ok,
      durationMs: duration,
      responseLength: typeof responseBody === 'string' 
        ? responseBody.length 
        : JSON.stringify(responseBody).length,
      important: true
    });
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: responseBody
      }, { status: statusCode });
    }
    
    // Return the Perplexity API response
    return NextResponse.json({
      success: true,
      data: responseBody,
      model,
      timing: { total: duration }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Math.round(performance.now() - startTime);
    
    edgeLogger.error('Error calling Perplexity API (serverless)', {
      operation: 'perplexity_serverless_error',
      operationId,
      error: errorMessage,
      durationMs: duration,
      important: true
    });
    
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
} 