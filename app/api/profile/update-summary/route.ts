import { createClient } from '@/utils/supabase/server';
import { logger } from '@/lib/logger';
import { generateWebsiteSummary } from '@/lib/agents/tools/website-summarizer';
import { successResponse, errorResponse, notFoundError } from '@/lib/utils/route-handler';
import { withAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';
import { handleCors } from '@/lib/utils/http-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum allowed duration for Hobby plan (60 seconds)

// Safety timeout - slightly less than maxDuration to ensure we return a response
const SAFETY_TIMEOUT_MS = 55000; // 55 seconds

/**
 * Endpoint to generate and update a user's profile website summary
 */
export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();
  const operation = 'update_website_summary';

  // Create a timeout promise that resolves after SAFETY_TIMEOUT_MS
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        timeoutReached: true,
        message: 'Processing is taking longer than expected. Please try again later.'
      });
    }, SAFETY_TIMEOUT_MS);
  });

  try {
    // Get request data
    const { url } = await request.json();

    // Manual Authentication using server client
    const supabaseServerClient = await createClient();
    const { data: { user }, error: authError } = await supabaseServerClient.auth.getUser();

    if (authError || !user) {
      logger.warn('Authentication failed for update-summary', {
        operation,
        error: authError?.message
      });
      const errRes = notFoundError('Authentication required'); // Using notFoundError to align with potential RLS behavior
      return handleCors(errRes, request, true); // Wrap with CORS
    }
    const userId = user.id;

    if (!url) {
      const errRes = errorResponse('URL is required', null, 400);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // Validate URL starts with https://
    if (!url.startsWith('https://')) {
      const errRes = errorResponse('URL must start with https://', null, 400);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    logger.info('Starting website summary generation and profile update', {
      userId: userId.substring(0, 8) + '...',
      urlDomain: new URL(url).hostname,
      operation
    });

    // Verify user profile exists (check is implicitly done by the update)
    // Generate the summary and update the profile with timeout safety
    try {
      logger.info('Starting website summary generation', {
        userId: userId.substring(0, 8) + '...',
        urlDomain: new URL(url).hostname,
        operation
      });

      // Create the processing promise
      const processingPromise = async () => {
        // Generate the summary
        const summaryResult = await generateWebsiteSummary(url, { maxWords: 1000 });

        if (!summaryResult || summaryResult.error) {
          logger.error('Failed to generate website summary', {
            userId: userId.substring(0, 8) + '...',
            url,
            error: summaryResult?.error,
            operation
          });
          return {
            success: false,
            message: 'Failed to generate website summary'
          };
        }

        logger.info('Website summary generated successfully', {
          userId: userId.substring(0, 8) + '...',
          summaryLength: summaryResult.summary.length,
          wordCount: summaryResult.wordCount,
          title: summaryResult.title,
          operation
        });

        // Update the profile with the generated summary using the same server client
        const { error } = await supabaseServerClient
          .from('sd_user_profiles')
          .update({
            website_summary: summaryResult.summary,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (error) {
          logger.error('Error updating website summary in profile', {
            userId: userId.substring(0, 8) + '...',
            error: error.message,
            operation
          });
          return {
            success: false,
            message: 'Error updating profile with website summary'
          };
        }

        logger.info('Profile updated with website summary', {
          userId: userId.substring(0, 8) + '...',
          processingTimeMs: Date.now() - startTime,
          operation
        });

        return {
          success: true,
          message: 'Website summary generated and saved',
          summary: summaryResult.summary
        };
      };

      // Race the processing promise against the timeout
      const result = await Promise.race([processingPromise(), timeoutPromise]) as any;

      // Check if timeout was reached
      if (result.timeoutReached) {
        logger.warn('Website summary generation timed out', {
          userId: userId.substring(0, 8) + '...',
          url,
          timeoutMs: SAFETY_TIMEOUT_MS,
          operation
        });

        const errRes = errorResponse(
          'Processing is taking longer than expected. Please try again later.',
          { timedOut: true },
          408
        );
        return handleCors(errRes, request, true); // Wrap with CORS
      }

      // Return the result from processing
      const response = result.success
        ? successResponse(result)
        : errorResponse(result.message, null, 500);
      return handleCors(response, request, true); // Wrap with CORS
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error in website summary generation', {
        userId: userId.substring(0, 8) + '...',
        url,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack trace',
        operation
      });

      const errRes = errorResponse('Error generating website summary', error, 500);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Unexpected error in website summary API', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      operation
    });

    const errRes = errorResponse('Internal server error', error, 500);
    return handleCors(errRes, request, true); // Wrap with CORS
  }
}