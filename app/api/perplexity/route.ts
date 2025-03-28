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

  // Enhanced debug logging for API key
  edgeLogger.info('Perplexity API key detailed inspection', {
    operation: 'perplexity_key_debug',
    operationId,
    keyExists: !!perplexityApiKey,
    keyLength: perplexityApiKey?.length || 0,
    keyFormat: perplexityApiKey?.startsWith('pplx-') ? 'valid_prefix' : 'invalid_prefix',
    keyFirstChar: perplexityApiKey ? perplexityApiKey.charAt(0) : 'none',
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    isProduction: process.env.NODE_ENV === 'production',
    environment: process.env.NODE_ENV,
    important: true
  });

  edgeLogger.debug('Perplexity API environment check', {
    operation: 'perplexity_env_check',
    operationId,
    keyExists: !!perplexityApiKey,
    keyLength: perplexityApiKey?.length || 0,
    nodeEnv: process.env.NODE_ENV
  });

  // Run environment validation early
  validateEnvironment();

  edgeLogger.info('Perplexity serverless function called', {
    operation: 'perplexity_serverless_call',
    operationId
  });

  // Add detailed header logging for debugging
  const headerEntries = Array.from(req.headers.entries());
  const headers = Object.fromEntries(headerEntries);

  // Enhanced headers debugging
  edgeLogger.info('Perplexity request detailed headers analysis', {
    operation: 'perplexity_headers_detailed',
    operationId,
    headerCount: headerEntries.length,
    hasContentType: !!headers['content-type'],
    contentType: headers['content-type'],
    userAgent: req.headers.get('user-agent'),
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    method: req.method,
    url: req.url,
    important: true
  });

  edgeLogger.debug('Perplexity request headers', {
    operation: 'perplexity_headers_debug',
    operationId,
    headers,
    userAgent: req.headers.get('user-agent')
  });

  // Check if the request is from our own server (internal API-to-API)
  const userAgent = req.headers.get('user-agent') || '';
  const isInternalRequest = userAgent.includes('SanDiego');

  edgeLogger.info('Perplexity authentication decision detailed', {
    operation: 'perplexity_auth_detailed',
    operationId,
    userAgent,
    userAgentLength: userAgent.length,
    isInternalRequest,
    containsSanDiego: userAgent.includes('SanDiego'),
    containsMozilla: userAgent.includes('Mozilla'),
    userAgentFirstChars: userAgent.substring(0, 20),
    important: true
  });

  edgeLogger.debug('Perplexity authentication decision', {
    operation: 'perplexity_auth_debug',
    operationId,
    userAgent,
    isInternalRequest
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
  edgeLogger.debug('PERPLEXITY_API_KEY format validation', {
    operation: 'perplexity_key_format',
    operationId,
    keyFormat: perplexityApiKey.startsWith('pplx-') ? 'valid_prefix' : 'invalid_prefix',
    keyLength: perplexityApiKey.length
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

    // Fix the authorization header format to strictly follow Perplexity documentation
    // Ensure there's a single space between "Bearer" and the token
    const apiKey = perplexityApiKey.trim();
    const authorizationHeader = `Bearer ${apiKey}`;

    // Log the exact authorization header format (without exposing the actual key)
    edgeLogger.info('Authorization header format check', {
      operation: 'perplexity_auth_header_check',
      operationId,
      startsWithBearer: authorizationHeader.startsWith('Bearer '),
      hasSpaceAfterBearer: authorizationHeader.charAt(6) === ' ',
      headerLength: authorizationHeader.length,
      bearerPrefix: authorizationHeader.substring(0, 7),
      keyStartsWithPplx: apiKey.startsWith('pplx-'),
      important: true
    });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': authorizationHeader,
      'User-Agent': 'Mozilla/5.0 SanDiego/1.0'
    };

    // Log detailed information about the request and authorization
    edgeLogger.info('Perplexity API request detailed debug info', {
      operation: 'perplexity_request_debug',
      operationId,
      url: API_URL,
      model,
      authHeaderExists: !!headers['Authorization'],
      authHeaderLength: headers['Authorization'].length,
      authHeaderPrefix: headers['Authorization'].substring(0, 7), // Only log "Bearer " part
      contentTypeHeader: headers['Content-Type'],
      userAgentHeader: headers['User-Agent'],
      requestBodyKeys: Object.keys(requestBody),
      important: true
    });

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
    const responseHeaders = Object.fromEntries(response.headers.entries());

    // Enhanced response header logging
    edgeLogger.info('Perplexity API response headers', {
      operation: 'perplexity_response_headers',
      operationId,
      statusCode,
      responseHeadersCount: Object.keys(responseHeaders).length,
      contentType: responseHeaders['content-type'],
      contentLength: responseHeaders['content-length'],
      server: responseHeaders['server'],
      important: true
    });

    let responseBody;
    try {
      if (response.ok) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();

        // Enhanced error response logging
        edgeLogger.error('Perplexity API error detailed response', {
          operation: 'perplexity_detailed_error_response',
          operationId,
          statusCode,
          responseType: typeof responseBody,
          responsePreview: typeof responseBody === 'string' ?
            responseBody.substring(0, 500) : 'Not string',
          responseLength: typeof responseBody === 'string' ?
            responseBody.length : 0,
          importantSnippet: typeof responseBody === 'string' && responseBody.includes('error') ?
            responseBody.substring(responseBody.indexOf('error'), Math.min(responseBody.indexOf('error') + 100, responseBody.length)) :
            'No error snippet found',
          important: true
        });
      }
    } catch (e) {
      responseBody = 'Error parsing response';

      edgeLogger.error('Perplexity API response parsing error', {
        operation: 'perplexity_response_parse_error',
        operationId,
        error: e instanceof Error ? e.message : String(e),
        important: true
      });
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
        : JSON.stringify(responseBody).length
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

    // Enhanced fetch error logging
    edgeLogger.error('Perplexity API fetch error detailed', {
      operation: 'perplexity_serverless_fetch_error_detailed',
      operationId,
      errorMessage,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack',
      durationMs: duration,
      important: true
    });

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