import { z } from "zod";
import { AgentTool } from "../../core/agent-types";
import { createAgentLogger } from "../../core/agent-logger";

const API_URL = "https://api.perplexity.ai/chat/completions";

// Create a tool-specific logger based on the agent logger
function createToolLogger(toolId: string) {
  return createAgentLogger(`tool:${toolId}` as any, {});
}

const logger = createToolLogger("perplexity");

// Runtime detection for better error handling
const isEdgeRuntime = typeof (globalThis as any).EdgeRuntime === 'string';
const runtime = isEdgeRuntime ? 'edge' : 'node';

// Safeguard initialization
let isInitialized = false;

/**
 * Get the status of the Perplexity API client
 */
export function getClient() {
  if (!isInitialized) {
    if (!process.env.PERPLEXITY_API_KEY) {
      logger.warn("PERPLEXITY_API_KEY is not set in environment variables", {
        operation: "perplexity_init_failed",
        important: true
      });
      throw new Error("PERPLEXITY_API_KEY is not set");
    }

    isInitialized = true;
    logger.info("Perplexity API client initialized", {
      operation: "perplexity_init_success",
      runtime
    });
  }
  return { isReady: true };
}

/**
 * Call the Perplexity API to get enhanced search results
 * This implementation uses the serverless endpoint to avoid VPN detection issues
 */
export async function callPerplexityAPI(query: string): Promise<{
  content: string;
  model: string;
  timing: { total: number };
}> {
  const startTime = Date.now();
  const operationId = `perplexity-${Date.now().toString(36)}`;

  try {
    // Runtime environment detection for debugging
    const runtimeInfo = {
      type: runtime,
      environment: process.env.NODE_ENV || 'development',
      vercelEnv: process.env.VERCEL_ENV || 'unknown'
    };

    // Enhanced API key validation and logging
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    logger.info("Perplexity client-side API key validation", {
      operation: "perplexity_client_key_check",
      operationId,
      keyExists: !!perplexityApiKey,
      keyLength: perplexityApiKey?.length || 0,
      keyFormatValid: perplexityApiKey?.startsWith('pplx-') || false,
      envVars: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL_URL: process.env.VERCEL_URL,
        VERCEL_REGION: process.env.VERCEL_REGION
      },
      important: true
    });

    // Log API key existence and format information (not the key itself)
    logger.info("Perplexity API key check", {
      operation: "perplexity_key_check",
      operationId,
      keyExists: !!process.env.PERPLEXITY_API_KEY,
      keyLength: process.env.PERPLEXITY_API_KEY?.length || 0,
      keyFormatValid: process.env.PERPLEXITY_API_KEY?.startsWith('pplx-') || false,
      important: true
    });

    logger.info("Calling Perplexity API via serverless function", {
      operation: "perplexity_call_started",
      operationId,
      queryLength: query.length,
      queryPreview: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
      runtime: runtimeInfo,
      important: true
    });

    // Get base URL for API endpoint with enhanced URL construction debugging
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = process.env.VERCEL_URL || 'localhost:3000';
    const apiUrl = `${protocol}://${host}/api/perplexity`;

    logger.info("Perplexity URL construction details", {
      operation: "perplexity_url_construction",
      operationId,
      protocol,
      host,
      fullUrl: apiUrl,
      vercelUrl: process.env.VERCEL_URL,
      nodeEnv: process.env.NODE_ENV,
      important: true
    });

    // Define headers with special User-Agent for internal requests
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 SanDiego/1.0"
    };

    // Enhanced request logging
    logger.info("Perplexity serverless API request details", {
      operation: "perplexity_request_details",
      operationId,
      url: apiUrl,
      headers, // Log the headers being sent
      hasContentType: !!headers["Content-Type"],
      userAgent: headers["User-Agent"],
      queryLength: query.length,
      runtime: runtimeInfo.type,
      important: true
    });

    logger.info("Perplexity serverless API request", {
      operation: "perplexity_serverless_request",
      operationId,
      url: apiUrl,
      headers, // Log the headers being sent
      runtime: runtimeInfo.type
    });

    // Call our serverless API endpoint
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    });

    // Enhanced response status logging
    logger.info("Perplexity API response status", {
      operation: "perplexity_response_status",
      operationId,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headerKeys: Array.from(response.headers.keys()),
      contentType: response.headers.get('content-type'),
      important: true
    });

    if (!response.ok) {
      const errorText = await response.text();

      logger.error("Perplexity serverless API error response", {
        operation: "perplexity_serverless_error",
        operationId,
        statusCode: response.status,
        statusText: response.statusText,
        errorTextLength: errorText.length,
        errorTextPreview: errorText.substring(0, 500),
        runtime: runtimeInfo.type,
        important: true
      });

      throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    // Enhanced result validation
    logger.info("Perplexity API result validation", {
      operation: "perplexity_result_validation",
      operationId,
      resultKeys: Object.keys(result),
      hasSuccess: 'success' in result,
      isSuccess: result.success === true,
      hasData: 'data' in result,
      hasError: 'error' in result,
      errorMessage: result.error || null,
      important: true
    });

    if (!result.success) {
      throw new Error(`Serverless API error: ${result.error}`);
    }

    // Extract data from the serverless API response
    const data = result.data;
    const content = data.choices[0].message.content;

    const duration = Date.now() - startTime;

    logger.info("Perplexity API call successful via serverless", {
      operation: "perplexity_call_success",
      operationId,
      responseLength: content.length,
      model: data.model,
      durationMs: duration,
      runtime: runtimeInfo.type,
      important: true
    });

    return {
      content,
      model: data.model,
      timing: { total: duration }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;

    // Enhanced error logging
    logger.error("Detailed error calling Perplexity API", {
      operation: "perplexity_detailed_error",
      operationId,
      errorMessage,
      errorType: error instanceof Error ? error.name : typeof error,
      errorStack: error instanceof Error ? error.stack : 'No stack available',
      runtime,
      durationMs: duration,
      important: true
    });

    logger.error("Error calling Perplexity API", {
      operation: "perplexity_call_error",
      operationId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error),
      runtime,
      durationMs: duration,
      important: true
    });

    // Provide a fallback mechanism for errors
    return {
      content: `DeepSearch was unable to complete due to a technical issue: ${errorMessage}. Continuing with available knowledge.`,
      model: "error",
      timing: { total: duration }
    };
  }
}

/**
 * Stream results from Perplexity API
 * Note: Streaming is not supported through the serverless function currently
 */
export async function streamPerplexityAPI(
  query: string,
  callbacks: {
    onStart?: () => void;
    onToken?: (token: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: Error) => void;
  }
) {
  const startTime = Date.now();
  const operationId = `perplexity-stream-${Date.now().toString(36)}`;
  let fullResponse = "";

  try {
    // Log stream start with runtime info for debugging
    logger.info("Perplexity streaming not supported with serverless function", {
      operation: "perplexity_stream_fallback",
      operationId,
      important: true
    });

    // Call non-streaming API instead
    callbacks.onStart?.();

    // Get the non-streaming response
    const result = await callPerplexityAPI(query);
    fullResponse = result.content;

    // Simulate streaming by breaking the response into tokens
    const tokens = fullResponse.split(/(\s+)/);
    for (const token of tokens) {
      callbacks.onToken?.(token);
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    callbacks.onComplete?.(fullResponse);

    return fullResponse;
  } catch (error) {
    logger.error("Perplexity streaming fallback failed", {
      operation: "perplexity_stream_error",
      operationId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });

    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    return "";
  }
} 