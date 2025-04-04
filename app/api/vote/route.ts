/**
 * Vote API Route
 * 
 * Handles user votes on chat messages
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';
import type { PostgrestError } from '@supabase/supabase-js';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { handleCors } from '@/lib/utils/http-utils';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Votes are now stored directly in the sd_chat_histories table as a column,
// so this endpoint now handles voting on messages

// Add at the top of the file after imports
function formatError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

// We've removed the GET method as vote data is now included with chat messages
// This eliminates redundant API calls

/**
 * POST handler to submit a vote on a message
 */
const POST_Handler: AuthenticatedRouteHandler = async (request, context) => {
  const { user } = context;
  const operationId = `vote_${Math.random().toString(36).substring(2, 10)}`;
  const userId = user.id; // Get userId from user parameter

  try {
    // 1. Parse and Validate Body
    let messageId: string;
    let vote: 'up' | 'down' | null;
    try {
      const body = await request.json();
      messageId = body.messageId;
      vote = body.vote;

      if (!messageId || typeof messageId !== 'string') {
        return errorResponse('messageId (string) is required', null, 400);
      }
      if (vote !== 'up' && vote !== 'down' && vote !== null) {
        return errorResponse('Vote must be "up", "down", or null', null, 400);
      }
    } catch (parseError: unknown) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      edgeLogger.error('Error parsing vote request body', { operationId, error: errorMessage });
      return errorResponse('Invalid request body', errorMessage, 400);
    }

    edgeLogger.info('Processing vote', {
      messageId: messageId,
      voteType: vote,
      userId: userId.substring(0, 8),
      operationId
    });

    const supabase = await createRouteHandlerClient();

    // 2. Verify Message Exists & Ownership (via Session)
    // Handle compound ID if necessary
    let actualMessageId = messageId;
    if (messageId.includes('-msg-')) {
      const parts = messageId.split('-msg-');
      if (parts.length === 2) {
        actualMessageId = parts[1];
      }
    }

    const { data: message, error: messageError } = await supabase
      .from('sd_chat_histories')
      .select('id, session_id')
      .eq('id', actualMessageId)
      .maybeSingle();

    if (messageError || !message) {
      edgeLogger.warn('Message not found for vote or DB error', {
        operationId, messageId, actualMessageId,
        error: messageError?.message || 'Message not found',
        userId: userId.substring(0, 8)
      });
      // Fail silently on client if message not found
      return successResponse({ success: true, message: 'Message not found or error occurred' });
    }

    // Check session ownership (RLS on sd_chat_sessions should enforce this, but explicit check is safer)
    const { error: sessionError } = await supabase
      .from('sd_chat_sessions')
      .select('id')
      .eq('id', message.session_id)
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (sessionError) {
      edgeLogger.warn('Vote authorization failed (session ownership check)', {
        operationId, messageId, actualMessageId, sessionId: message.session_id,
        userId: userId.substring(0, 8),
        error: sessionError.message
      });
      return unauthorizedError('Cannot vote on messages in this chat session');
    }

    // 3. Update Vote
    const { error: updateError } = await supabase
      .from('sd_chat_histories')
      .update({ vote })
      .eq('id', message.id);

    if (updateError) {
      edgeLogger.error('Failed to update vote in database', {
        operationId, messageId: message.id, userId: userId.substring(0, 8),
        error: updateError.message
      });
      return errorResponse('Failed to update vote', updateError, 500);
    }

    edgeLogger.info('Vote updated successfully', {
      operationId, messageId: message.id, userId: userId.substring(0, 8), vote
    });

    return successResponse({ success: true });

  } catch (error) {
    edgeLogger.error('Unexpected error processing vote', {
      operationId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
    return errorResponse('Internal server error', error instanceof Error ? error : String(error), 500);
  }
};

// Apply withAuth wrapper
export const POST = withAuth(POST_Handler);