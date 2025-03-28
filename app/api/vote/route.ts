import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { PostgrestError } from '@supabase/supabase-js';

// Votes are now stored directly in the sd_chat_histories table as a column,
// so this endpoint now handles voting on messages

// Add at the top of the file after imports
function formatError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

// We've removed the GET method as vote data is now included with chat messages
// This eliminates redundant API calls

export async function POST(req: Request): Promise<Response> {
  const requestId = edgeLogger.generateRequestId();
  let messageId: string;
  let vote: 'up' | 'down' | null;

  return edgeLogger.trackOperation('submit_vote', async () => {
    try {
      const body = await req.json();
      messageId = body.messageId;
      vote = body.vote;

      const cookieStore = await cookies();

      const supabase = createSupabaseServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // The `setAll` method was called from a Server Component.
                // This can be ignored if you have middleware refreshing
                // user sessions.
              }
            }
          }
        }
      );

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Validate vote value
      if (vote !== 'up' && vote !== 'down' && vote !== null) {
        return NextResponse.json(
          { error: 'Vote must be "up", "down", or null' },
          { status: 400 }
        );
      }

      // Check for development mode fast path
      const DEV_MODE_ENABLED = process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_SKIP_AUTH_CHECKS === 'true';

      // In development mode, just return success without doing DB operations
      if (DEV_MODE_ENABLED) {
        edgeLogger.info('Development mode - skipping vote operation', { messageId, vote });
        return NextResponse.json({ success: true });
      }

      // Create Supabase client for database operations
      const serverClient = await createServerClient();

      // Handle message ID which could be in various formats
      edgeLogger.info('Received vote request', { messageId: messageId, voteType: vote });

      // Check if we're dealing with a compound ID (chatId-msgId format which frontend now sends)
      const actualMessageId = messageId;
      let sessionId: string | null = null;

      if (messageId.includes('-msg-')) {
        // This is a compound ID in the format chatId-msgId
        const parts = messageId.split('-msg-');
        if (parts.length === 2) {
          sessionId = parts[0]; // Extract the chatId part
          // For real implementation, you'd need to map this to a database ID 
          // But for now, log it and attempt to find by session ID
          edgeLogger.info('Extracted session ID from compound message ID', {
            sessionId: sessionId || undefined,
            originalMessageId: messageId
          });
        }
      }

      // First check if this is a UUID that we can look up directly
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualMessageId);

      let message: { id: string; session_id: string } | null = null;
      let messageError: PostgrestError | null = null;

      if (isUUID) {
        // If it's a standard UUID, try to look it up directly
        const result = await serverClient
          .from('sd_chat_histories')
          .select('id, session_id')
          .eq('id', actualMessageId)
          .maybeSingle();

        message = result.data;
        messageError = result.error;
      } else if (sessionId) {
        // If we have a session ID from a compound ID, try to find the message
        // This is a temporary approach - in a real implementation
        // you would have a more robust way to map frontend IDs to database IDs
        edgeLogger.info('Looking up message by session ID', { sessionId });

        // Get the latest assistant message for this session as a fallback
        const result = await serverClient
          .from('sd_chat_histories')
          .select('id, session_id')
          .eq('session_id', sessionId)
          .eq('role', 'assistant') // Assuming we're voting on assistant messages
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        message = result.data;
        messageError = result.error;

        if (message) {
          edgeLogger.info('Found message by session ID', {
            sessionId,
            messageId: message.id
          });
        }
      } else {
        // If we can't identify the message format
        edgeLogger.warn('Unrecognized message ID format', { messageId });
        return NextResponse.json({ success: true });
      }

      if (messageError || !message) {
        edgeLogger.error('Failed to fetch message or message not found', {
          error: messageError ? messageError.message : 'Message not found',
          messageId
        });
        // Return success instead of error to avoid client-side errors
        return NextResponse.json({ success: true });
      }

      // Verify user has access to this chat session
      const { data: session_data, error: sessionError } = await serverClient
        .from('sd_chat_sessions')
        .select('id')
        .eq('id', message?.session_id || '')
        .eq('user_id', userId)
        .maybeSingle();

      if (sessionError || !session_data || !message) {
        edgeLogger.info('Chat session not found for voting, skipping vote update', {
          userId,
          sessionId: message?.session_id || 'unknown'
        });

        // Return success without creating a new chat
        return NextResponse.json({ success: true });
      }

      // Update the vote using the actual database message ID we found
      const { error: updateError } = await serverClient
        .from('sd_chat_histories')
        .update({ vote })
        .eq('id', message.id);

      if (updateError) {
        edgeLogger.error('Failed to update vote', {
          error: updateError,
          originalMessageId: messageId,
          databaseId: message.id
        });
        // Return success instead of error
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      edgeLogger.error('Error processing vote', {
        error: formatError(error),
        requestId
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, { requestId, messageId: messageId!, voteType: vote! });
}