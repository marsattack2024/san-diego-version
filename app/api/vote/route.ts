import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';
import type { PostgrestError } from '@supabase/supabase-js';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { withAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';

// Votes are now stored directly in the sd_chat_histories table as a column,
// so this endpoint now handles voting on messages

// Add at the top of the file after imports
function formatError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

// We've removed the GET method as vote data is now included with chat messages
// This eliminates redundant API calls

export const POST = withAuth(async (user: User, req: Request): Promise<Response> => {
  const requestId = edgeLogger.generateRequestId();
  const userId = user.id;
  let messageId: string;
  let vote: 'up' | 'down' | null;

  return edgeLogger.trackOperation('submit_vote', async () => {
    try {
      const body = await req.json();
      messageId = body.messageId;
      vote = body.vote;

      // Validate vote value
      if (vote !== 'up' && vote !== 'down' && vote !== null) {
        return errorResponse('Vote must be "up", "down", or null', null, 400);
      }

      // Create Supabase client using route handler utility
      const supabase = await createRouteHandlerClient();

      // Handle message ID which could be in various formats
      edgeLogger.info('Received vote request', {
        messageId: messageId,
        voteType: vote,
        userId: userId.substring(0, 8)
      });

      // Check if we're dealing with a compound ID (chatId-msgId format which frontend now sends)
      let actualMessageId = messageId;
      let sessionId: string | null = null;

      if (messageId.includes('-msg-')) {
        const parts = messageId.split('-msg-');
        if (parts.length === 2) {
          sessionId = parts[0]; // Extract the chatId part
          actualMessageId = parts[1]; // Use the actual message ID part
        }
      }

      // Verify the message exists and belongs to the user's session (via RLS on sessions table)
      const { data: message, error: messageError } = await supabase
        .from('sd_chat_histories')
        .select('id, session_id')
        .eq('id', actualMessageId)
        .maybeSingle();

      if (messageError || !message) {
        edgeLogger.warn('Failed to find message or message not found for vote', {
          error: messageError ? messageError.message : 'Message not found',
          messageId,
          userId: userId.substring(0, 8)
        });
        return successResponse({ success: true }); // Fail silently on client
      }

      // Double check session ownership for safety
      const { error: sessionError } = await supabase
        .from('sd_chat_sessions')
        .select('id')
        .eq('id', message.session_id)
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (sessionError) {
        edgeLogger.warn('User does not own chat session for this vote', {
          userId: userId.substring(0, 8),
          sessionId: message.session_id,
          messageId: message.id,
          error: sessionError.message
        });
        return unauthorizedError('Cannot vote on messages in this chat');
      }

      // Update the vote
      const { error: updateError } = await supabase
        .from('sd_chat_histories')
        .update({ vote })
        .eq('id', message.id);

      if (updateError) {
        edgeLogger.error('Failed to update vote', {
          error: updateError.message,
          messageId: message.id,
          userId: userId.substring(0, 8)
        });
        return errorResponse('Failed to update vote', updateError, 500);
      }

      edgeLogger.info('Vote updated successfully', {
        messageId: message.id,
        vote,
        userId: userId.substring(0, 8)
      });

      return successResponse({ success: true });
    } catch (error) {
      edgeLogger.error('Error processing vote', {
        error: formatError(error),
        requestId
      });
      return errorResponse('Internal server error', error, 500);
    }
  }, { requestId });
});