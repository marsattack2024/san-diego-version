/**
 * Vote API Route
 * 
 * Handles user votes on chat messages (Pattern B - Direct Export)
 */

// import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth'; // Remove Pattern A import
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod'; // Keep for validation
import { LOG_CATEGORIES } from '@/lib/logger/constants'; // Import if needed for logging
import type { User } from '@supabase/supabase-js'; // Keep for manual auth check

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Validation schema for vote request body
const VoteSchema = z.object({
  message_id: z.string().uuid('Invalid message ID'),
  vote_type: z.enum(['upvote', 'downvote'])
});

/**
 * POST handler to submit a vote on a message (Pattern B - Direct Export)
 */
// Removed AuthenticatedRouteHandler type
export async function POST(request: Request): Promise<Response> { // Direct export
  const operationId = `vote_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Manual Auth Check
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      edgeLogger.warn('Authentication required for voting', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        error: authError?.message
      });
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true);
    }
    const userId = user.id;

    // Validate request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      const errRes = validationError('Invalid JSON body');
      return handleCors(errRes, request, true);
    }

    const validationResult = VoteSchema.safeParse(body);
    if (!validationResult.success) {
      const errRes = validationError('Invalid request body', validationResult.error.format());
      return handleCors(errRes, request, true);
    }
    const { message_id, vote_type } = validationResult.data;

    edgeLogger.info('Processing message vote', {
      category: LOG_CATEGORIES.CHAT, // Example category
      operationId,
      userId: userId.substring(0, 8),
      messageId: message_id.substring(0, 8),
      voteType: vote_type
    });

    // Upsert the vote into the database
    const { data, error: upsertError } = await supabase
      .from('sd_message_votes') // Assuming table name
      .upsert({
        message_id: message_id,
        user_id: userId,
        vote_type: vote_type,
        // updated_at is likely handled by DB trigger/default
      })
      .select() // Select the inserted/updated record
      .single();

    if (upsertError) {
      edgeLogger.error('Error saving vote to database', {
        category: LOG_CATEGORIES.DB,
        operationId,
        userId: userId.substring(0, 8),
        messageId: message_id.substring(0, 8),
        voteType: vote_type,
        error: upsertError.message
      });
      const errRes = errorResponse('Failed to save vote', upsertError);
      return handleCors(errRes, request, true);
    }

    if (!data) { // Should be caught by .single(), but safety check
      edgeLogger.error('Vote data unexpectedly null after upsert', { operationId, userId: userId.substring(0, 8), messageId: message_id.substring(0, 8) });
      const errRes = errorResponse('Failed to retrieve vote after saving', null, 500);
      return handleCors(errRes, request, true);
    }

    edgeLogger.info('Successfully recorded vote', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: userId.substring(0, 8),
      messageId: message_id.substring(0, 8),
      voteType: vote_type
    });

    const response = successResponse({ vote: data });
    return handleCors(response, request, true);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    edgeLogger.error('Unexpected error processing vote', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: errorMsg,
      important: true
    });
    const errRes = errorResponse('Unexpected error processing vote', error, 500);
    return handleCors(errRes, request, true);
  }
}

// Removed export const POST = withAuth(POST_Handler);