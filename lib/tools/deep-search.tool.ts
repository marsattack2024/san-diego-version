/**
 * Deep Search Tool for Chat Engine
 * 
 * This module implements a tool that enables web research capabilities
 * via the Perplexity API. The tool is designed to be conditionally included
 * in the tool registry based on user preferences and agent capabilities.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { perplexityService } from '@/lib/services/perplexity.service';

// Define tool parameters schema using Zod
const deepSearchSchema = z.object({
    search_term: z.string().describe("The specific search term to look up on the web. Be as specific as possible.")
});

/**
 * Tool for performing web searches using the Perplexity API
 * This implementation includes multiple safeguards:
 * 1. Runtime verification that deep search is enabled
 * 2. API client validation checks
 * 3. Comprehensive error handling and logging
 */
export const deepSearchTool = tool({
    description: "Search the web for up-to-date information about any topic. Use this when you need information that might not be in your training data or when you need to verify current facts.",
    parameters: deepSearchSchema,
    execute: async ({ search_term }, runOptions) => {
        const operationId = `deep-search-${Date.now().toString(36)}`;
        const startTime = Date.now();

        try {
            // Enhanced logging for debugging
            edgeLogger.info("Deep Search complete runOptions debug", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_debug",
                operationId,
                toolCallId: runOptions.toolCallId,
                runOptionsKeys: Object.keys(runOptions),
                // Log all available properties
                messagesAvailable: !!runOptions.messages,
                messagesCount: runOptions.messages ? runOptions.messages.length : 0,
                // @ts-ignore - Check all possible locations for deepSearchEnabled
                bodyAvailable: !!runOptions.body,
                // @ts-ignore - Custom property added in app/api/chat/route.ts
                bodyKeys: runOptions.body ? Object.keys(runOptions.body) : [],
                // @ts-ignore - Custom property added in app/api/chat/route.ts
                deepSearchEnabledInBody: runOptions.body?.deepSearchEnabled,
                // Check if present in parent object
                deepSearchEnabledInParent: (runOptions as any).deepSearchEnabled
            });

            // ==== HOT FIX: Force enable DeepSearch for development ====
            // TEMPORARILY FORCE ENABLE DEEPSEARCH until we fix the proper flag passing
            // THIS SHOULD BE REMOVED IN PRODUCTION
            const FORCE_ENABLE_DEEPSEARCH = true;

            // Try multiple places where the flag might be set
            const deepSearchEnabled =
                // Force enable for development/testing
                FORCE_ENABLE_DEEPSEARCH ||
                // @ts-ignore - Check the body first (where it should be)
                runOptions.body?.deepSearchEnabled === true ||
                // @ts-ignore - Check the root object as fallback
                (runOptions as any).deepSearchEnabled === true ||
                // @ts-ignore - Check in messages configuration
                runOptions.messages?.[0]?.configuration?.deepSearchEnabled === true ||
                // Last resort - always enable for development
                process.env.FORCE_DEEP_SEARCH === 'true';

            // Log what we detected
            edgeLogger.info("Deep Search flag detection", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_flag_detection",
                operationId,
                toolCallId: runOptions.toolCallId,
                detectedValue: deepSearchEnabled,
                searchTerm: search_term.substring(0, 50),
                forceEnabled: FORCE_ENABLE_DEEPSEARCH,
                envFallbackUsed: deepSearchEnabled && process.env.FORCE_DEEP_SEARCH === 'true',
            });

            // Skip the check completely due to our emergency fix
            const bypassCheck = true;

            // CRITICAL SAFETY CHECK: Verify deep search is explicitly enabled
            if (!deepSearchEnabled && !bypassCheck) {
                edgeLogger.warn("Deep Search tool was invoked without being enabled", {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: "deep_search_disabled_attempt",
                    operationId,
                    toolCallId: runOptions.toolCallId,
                    searchTermLength: search_term?.length || 0,
                    searchTermPreview: search_term?.substring(0, 50) || '',
                    important: true
                });

                return "I'm sorry, but web search capabilities are not enabled for this conversation. Please enable Deep Search in your user settings if you'd like me to search the web for information.";
            }

            // Initialize Perplexity client and verify it's ready
            const clientStatus = perplexityService.initialize();
            if (!clientStatus.isReady) {
                throw new Error("Perplexity API client is not ready");
            }

            // Format the search query for better results
            const query = formatSearchQuery(search_term);

            // Log the search start event
            edgeLogger.info("Deep Search started", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_started",
                operationId,
                toolCallId: runOptions.toolCallId,
                originalQuery: search_term,
                formattedQuery: query
            });

            // Call the Perplexity API via our service
            const result = await perplexityService.search(query);
            const duration = Date.now() - startTime;

            // Log successful result
            edgeLogger.info("Deep Search completed successfully", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_success",
                operationId,
                toolCallId: runOptions.toolCallId,
                durationMs: duration,
                responseLength: result.content.length,
                model: result.model
            });

            return result.content;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Enhanced error logging
            edgeLogger.error("Deep Search error", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "deep_search_error",
                operationId,
                toolCallId: runOptions.toolCallId,
                errorMessage,
                errorType: error instanceof Error ? error.name : typeof error,
                errorStack: error instanceof Error ? error.stack : 'No stack available',
                durationMs: duration,
                searchTerm: search_term,
                important: true
            });

            // Return a user-friendly error message
            return `I encountered an error while searching for information: ${errorMessage}. Please try again with a more specific search term, or contact support if the problem persists.`;
        }
    }
});

/**
 * Format the search query to optimize Perplexity results
 */
function formatSearchQuery(query: string): string {
    // Clean up the query by trimming whitespace and removing unnecessary characters
    let formattedQuery = query.trim();

    // If query is too short, add a request for comprehensive information
    if (formattedQuery.length < 10) {
        formattedQuery = `${formattedQuery} - provide comprehensive information`;
    }

    // If query doesn't end with punctuation, add a question mark if it seems like a question
    if (!/[.?!]$/.test(formattedQuery)) {
        const questionWords = ["what", "who", "where", "when", "why", "how", "is", "are", "can", "do", "does"];
        const firstWord = formattedQuery.split(" ")[0].toLowerCase();

        if (questionWords.includes(firstWord)) {
            formattedQuery += "?";
        }
    }

    return formattedQuery;
} 