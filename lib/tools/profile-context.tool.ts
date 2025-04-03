/**
 * Profile Context Tool for Chat Engine
 * 
 * This tool retrieves the user's business profile information from the database
 * to provide context for personalized AI responses.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createRouteHandlerClient } from '@/lib/supabase/route-client'; // Use route handler client for potential edge compatibility
import type { CoreMessage } from 'ai';

// Define the structure of the profile data we expect to return
// Excluding fields not relevant for AI context (user_id, created_at, updated_at, is_admin)
const profileSchema = z.object({
    full_name: z.string().optional().nullable(),
    company_name: z.string().optional().nullable(),
    website_url: z.string().optional().nullable(),
    company_description: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    website_summary: z.string().optional().nullable(),
});

// Tool definition
export const profileContextTool = tool({
    description: "Retrieves the user's saved business profile information (name, company name, description, location, website URL, website summary) to provide personalized assistance. Use this ONLY when specific business details are needed for the query (e.g., writing ads/copy, generating marketing ideas for *their* business, or analyzing *their* situation). Do not call this for general questions.",
    parameters: z.object({}), // No parameters needed from the AI
    execute: async ({ }, runOptions) => {
        const operationId = `profile_context_${Date.now().toString(36)}`;
        const startTime = Date.now();
        let userId: string | undefined;
        let sessionId: string | undefined;

        try {
            edgeLogger.info('Profile Context Tool execution started', {
                category: LOG_CATEGORIES.TOOLS,
                operationId,
                toolCallId: runOptions?.toolCallId
            });

            // --- Extract userId from context message workaround ---
            let executionContext: Record<string, any> | null = null;
            if (runOptions?.messages && Array.isArray(runOptions.messages)) {
                const contextMsg = runOptions.messages.find(msg => msg.role === 'system');
                if (contextMsg?.content) {
                    try {
                        executionContext = JSON.parse(contextMsg.content as string);
                        if (executionContext && typeof executionContext === 'object') {
                            userId = executionContext.userId;
                            sessionId = executionContext.sessionId;
                            edgeLogger.debug('Context parsed from system message', {
                                category: LOG_CATEGORIES.TOOLS, operationId, toolCallId: runOptions.toolCallId, userIdFound: !!userId
                            });
                        } else {
                            edgeLogger.warn('System message content parsed but not expected context format', {
                                category: LOG_CATEGORIES.TOOLS, operationId, toolCallId: runOptions.toolCallId
                            });
                        }
                    } catch (e) {
                        edgeLogger.debug('System message content was not valid JSON', {
                            category: LOG_CATEGORIES.TOOLS, operationId, toolCallId: runOptions.toolCallId
                        });
                    }
                }
            }
            // -----------------------------------------------------

            if (!userId) {
                edgeLogger.error('User ID not found in execution context for Profile Context Tool', {
                    category: LOG_CATEGORIES.TOOLS,
                    operationId,
                    toolCallId: runOptions?.toolCallId,
                    important: true
                });
                return "Error: Could not determine the user to fetch profile context.";
            }

            // --- Fetch profile data using Supabase --- 
            const supabase = await createRouteHandlerClient(); // Use appropriate client creation
            const { data: profileData, error } = await supabase
                .from('sd_user_profiles')
                .select('full_name, company_name, website_url, company_description, location, website_summary')
                .eq('user_id', userId)
                .single();

            if (error) {
                edgeLogger.error('Error fetching user profile from Supabase', {
                    category: LOG_CATEGORIES.TOOLS,
                    operationId,
                    toolCallId: runOptions?.toolCallId,
                    userId,
                    error: error.message,
                    important: true
                });
                return `Error: Failed to fetch user profile data. Details: ${error.message}`;
            }

            if (!profileData) {
                edgeLogger.warn('No profile data found for user', {
                    category: LOG_CATEGORIES.TOOLS,
                    operationId,
                    toolCallId: runOptions?.toolCallId,
                    userId
                });
                return "No profile data found for the current user. You may need to ask them for details or suggest they complete their profile.";
            }

            // --- Format and Return --- 
            // Validate fetched data against our schema (optional but good practice)
            const parsedProfile = profileSchema.parse(profileData);

            // Format into a readable string for the AI
            const formattedContext = [
                `User Profile Context:`,
                parsedProfile.full_name ? `- Name: ${parsedProfile.full_name}` : null,
                parsedProfile.company_name ? `- Company: ${parsedProfile.company_name}` : null,
                parsedProfile.location ? `- Location: ${parsedProfile.location}` : null,
                parsedProfile.website_url ? `- Website: ${parsedProfile.website_url}` : null,
                parsedProfile.company_description ? `- Description: ${parsedProfile.company_description}` : null,
                parsedProfile.website_summary ? `- Website Summary: ${parsedProfile.website_summary}` : null
            ].filter(line => line !== null).join('\n');

            edgeLogger.info('Profile Context Tool execution successful', {
                category: LOG_CATEGORIES.TOOLS,
                operationId,
                toolCallId: runOptions?.toolCallId,
                userId,
                durationMs: Date.now() - startTime,
                // Log which fields were found for debugging?
                // foundFields: Object.keys(parsedProfile).filter(k => parsedProfile[k] != null)
            });

            return formattedContext;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            edgeLogger.error('Unexpected error in Profile Context Tool', {
                category: LOG_CATEGORIES.TOOLS,
                operationId,
                toolCallId: runOptions?.toolCallId,
                userId,
                errorMessage,
                errorStack: error instanceof Error ? error.stack : undefined,
                durationMs: Date.now() - startTime,
                important: true
            });
            return `Error: An unexpected error occurred while retrieving profile context: ${errorMessage}`;
        }
    }
}); 