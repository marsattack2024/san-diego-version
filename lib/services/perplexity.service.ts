/**
 * Perplexity API Service
 * 
 * This service provides an interface for interacting with the Perplexity API
 * to perform web research. It's designed to be used by the Deep Search tool
 * in the chat engine.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
// Import the cacheService for caching deep search results
import { cacheService } from '@/lib/cache/cache-service';

// Constants
const INTERNAL_API_URL = "/api/perplexity";

// Runtime detection for better error handling
const isEdgeRuntime = typeof (globalThis as any).EdgeRuntime === 'string';
const runtime = isEdgeRuntime ? 'edge' : 'node';

// Interface for search results
export interface PerplexitySearchResult {
    content: string;
    model: string;
    timing: { total: number };
}

/**
 * Perplexity API Service class
 * Handles initialization and API calls to Perplexity
 */
class PerplexityService {
    private isInitialized = false;

    /**
     * Initialize the Perplexity client and verify API key
     * @returns Client status object
     */
    public initialize(): { isReady: boolean } {
        if (!this.isInitialized) {
            if (!process.env.PERPLEXITY_API_KEY) {
                edgeLogger.warn("PERPLEXITY_API_KEY is not set in environment variables", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "perplexity_init_failed",
                    important: true
                });
                throw new Error("PERPLEXITY_API_KEY is not set");
            }

            this.isInitialized = true;
            edgeLogger.info("Perplexity API client initialized", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_init_success",
                runtime
            });
        }
        return { isReady: true };
    }

    /**
     * Call the Perplexity API to search for information
     * Uses the internal serverless endpoint to avoid VPN detection issues
     * @param query - The search query
     * @returns Search result with content and metadata
     */
    public async search(query: string): Promise<PerplexitySearchResult> {
        const startTime = Date.now();
        const operationId = `perplexity-${Date.now().toString(36)}`;

        try {
            // Ensure the client is initialized before proceeding
            this.initialize();

            // Check cache first to avoid unnecessary API calls
            const cachedResults = await cacheService.getDeepSearchResults<PerplexitySearchResult>(query);
            if (cachedResults) {
                edgeLogger.info("Using cached deep search results", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "perplexity_cache_hit",
                    operationId,
                    queryLength: query.length,
                    responseLength: cachedResults.content.length
                });

                return cachedResults;
            }

            // Runtime environment information for debugging
            const runtimeInfo = {
                type: runtime,
                environment: process.env.NODE_ENV || 'development',
                vercelEnv: process.env.VERCEL_ENV || 'unknown'
            };

            // API key validation
            const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
            edgeLogger.info("Perplexity API key validation", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_client_key_check",
                operationId,
                keyExists: !!perplexityApiKey,
                keyLength: perplexityApiKey?.length || 0,
                keyFormatValid: perplexityApiKey?.startsWith('pplx-') || false
            });

            edgeLogger.info("Starting Perplexity search", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_search_started",
                operationId,
                queryLength: query.length,
                queryPreview: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
                runtime: runtimeInfo
            });

            // Determine the API URL based on environment
            const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
            const host = process.env.NODE_ENV === 'development'
                ? 'localhost:3000'
                : (process.env.NEXT_PUBLIC_HOST || 'marlan.photographytoprofits.com');

            const apiUrl = `${protocol}://${host}${INTERNAL_API_URL}`;

            edgeLogger.info("Perplexity request details", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_request_config",
                operationId,
                protocol,
                host,
                url: apiUrl
            });

            // Set up request headers
            const headers = {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 SanDiego/1.0"
            };

            // Make the API request
            const response = await fetch(apiUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({ query })
            });

            // Log response status
            edgeLogger.info("Perplexity API response status", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_response_status",
                operationId,
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                contentType: response.headers.get('content-type')
            });

            // Handle non-success responses
            if (!response.ok) {
                const errorText = await response.text();

                edgeLogger.error("Perplexity API error response", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "perplexity_api_error",
                    operationId,
                    statusCode: response.status,
                    statusText: response.statusText,
                    errorTextLength: errorText.length,
                    errorTextPreview: errorText.substring(0, 500),
                    important: true
                });

                throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            // Parse and validate response
            const result = await response.json();

            edgeLogger.info("Perplexity response validation", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_response_validation",
                operationId,
                resultKeys: Object.keys(result),
                hasSuccess: 'success' in result,
                isSuccess: result.success === true,
                hasData: 'data' in result,
                hasError: 'error' in result,
                errorMessage: result.error || null
            });

            // Check for success flag in response
            if (!result.success) {
                throw new Error(`Perplexity API error: ${result.error}`);
            }

            // Extract and format the response data
            let data = result.data;

            // Add validation to prevent "Cannot read properties of undefined" error
            if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
                // Try to handle nested structure where data itself might contain the full Perplexity response
                if (data && typeof data === 'object' && 'choices' in data) {
                    // The structure is already correct
                } else if (data && typeof data === 'object') {
                    // Log the actual structure received
                    edgeLogger.info("Perplexity API response structure details", {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: "perplexity_response_structure_details",
                        operationId,
                        dataKeys: Object.keys(data),
                        dataType: typeof data
                    });

                    // Check if data itself contains the Perplexity API response structure
                    const possibleNestedData = Object.values(data).find(
                        value => value && typeof value === 'object' && 'choices' in value
                    );

                    if (possibleNestedData) {
                        data = possibleNestedData;
                    } else {
                        edgeLogger.error("Invalid Perplexity API response format", {
                            category: LOG_CATEGORIES.TOOLS,
                            operation: "perplexity_invalid_response",
                            operationId,
                            dataKeys: Object.keys(data),
                            dataKeyValues: Object.keys(data).map(key =>
                                `${key}: ${typeof data[key]}`
                            ).join(', '),
                            important: true
                        });
                        throw new Error('Invalid response format from Perplexity API: missing choices array');
                    }
                } else {
                    throw new Error('Invalid response format from Perplexity API: missing choices array');
                }
            }

            // Additional validation for message structure
            if (!data.choices[0] || !data.choices[0].message) {
                edgeLogger.error("Missing message in Perplexity API response", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "perplexity_invalid_choice",
                    operationId,
                    firstChoice: JSON.stringify(data.choices[0]),
                    important: true
                });
                throw new Error('Invalid response format from Perplexity API: missing message in first choice');
            }

            const content = data.choices[0].message.content;
            const duration = Date.now() - startTime;

            edgeLogger.info("Perplexity search successful", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_search_success",
                operationId,
                responseLength: content.length,
                model: data.model,
                durationMs: duration
            });

            // Create formatted result
            const searchResult: PerplexitySearchResult = {
                content,
                model: data.model,
                timing: { total: duration }
            };

            // Cache the search result
            await cacheService.setDeepSearchResults(query, searchResult);

            edgeLogger.debug("Perplexity result cached", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_result_cached",
                operationId,
                queryLength: query.length,
                responseLength: content.length
            });

            // Return formatted result
            return searchResult;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log detailed error information
            edgeLogger.error("Perplexity search error", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_search_error",
                operationId,
                errorMessage,
                errorType: error instanceof Error ? error.name : typeof error,
                errorStack: error instanceof Error ? error.stack : 'No stack available',
                runtime,
                durationMs: duration,
                important: true
            });

            // Re-throw the error for the caller to handle
            throw error;
        }
    }
}

// Export a singleton instance
export const perplexityService = new PerplexityService(); 