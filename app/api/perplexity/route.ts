import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createClient } from '@/utils/supabase/server';
import { validateEnvironment } from '@/lib/env-validator';

// Important: No runtime declaration means this runs as a serverless function

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const operationId = `perplexity-serverless-${Date.now().toString(36)}`;
  
  // Environment variable validation and logging
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  edgeLogger.info('Perplexity API environment check', { 
    operation: 'perplexity_env_check',
    operationId,
    keyExists: !!perplexityApiKey,
    keyLength: perplexityApiKey?.length || 0,
    nodeEnv: process.env.NODE_ENV,
    important: true
  });
  
  // Run environment validation early
  validateEnvironment();
  
  edgeLogger.info('Perplexity serverless function called', { 
    operation: 'perplexity_serverless_call',
    operationId,
    important: true
  });
  
  // Add detailed header logging for debugging
  const headerEntries = Array.from(req.headers.entries());
  const headers = Object.fromEntries(headerEntries);
  edgeLogger.info('Perplexity request headers', {
    operation: 'perplexity_headers_debug',
    operationId,
    headers,
    userAgent: req.headers.get('user-agent'),
    important: true
  });
  
  // Check if the request is from our own server (internal API-to-API)
  const userAgent = req.headers.get('user-agent') || '';
  const isInternalRequest = userAgent.includes('SanDiego');
  
  edgeLogger.info('Perplexity authentication decision', {
    operation: 'perplexity_auth_debug',
    operationId,
    userAgent,
    isInternalRequest,
    important: true
  });
  
  // Only authenticate external requests, skip auth for internal server communication
  if (!isInternalRequest) {
    // Authenticate the request
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        edgeLogger.warn('Unauthorized access attempt to Perplexity API', {
          operation: 'perplexity_unauthorized',
          operationId
        });
        
        return NextResponse.json({
          success: false,
          error: 'Unauthorized'
        }, { status: 401 });
      }
      
      edgeLogger.info('User authenticated for Perplexity API', {
        operation: 'perplexity_auth_success',
        operationId,
        userId: user.id
      });
    } catch (authError) {
      edgeLogger.error('Authentication error in Perplexity API', {
        operation: 'perplexity_auth_error',
        operationId,
        error: authError instanceof Error ? authError.message : String(authError)
      });
      
      return NextResponse.json({
        success: false,
        error: 'Authentication error'
      }, { status: 500 });
    }
  } else {
    edgeLogger.info('Internal API-to-API request detected, skipping authentication', {
      operation: 'perplexity_internal_call',
      operationId
    });
  }
  
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
  
  // Check for API key with enhanced logging
  if (!perplexityApiKey) {
    edgeLogger.error('PERPLEXITY_API_KEY missing in serverless function', {
      operation: 'perplexity_key_missing',
      operationId,
      envKeys: Object.keys(process.env).filter(key => 
        !key.includes('KEY') && !key.includes('SECRET') && !key.includes('TOKEN')
      ),
      important: true
    });
    
    return NextResponse.json({
      success: false,
      error: 'PERPLEXITY_API_KEY not configured'
    }, { status: 500 });
  }
  
  // Log key format check (NOT the key itself)
  edgeLogger.info('PERPLEXITY_API_KEY format validation', {
    operation: 'perplexity_key_format',
    operationId,
    keyFormat: perplexityApiKey.startsWith('pplx-') ? 'valid_prefix' : 'invalid_prefix',
    keyLength: perplexityApiKey.length,
    important: true
  });
  
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
      'Authorization': `Bearer ${perplexityApiKey}`,
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