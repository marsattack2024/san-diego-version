import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';

export async function GET(
    request: NextRequest,
    context: { params: { id: string } }
): Promise<NextResponse> {
    try {
        // Properly await the params object before accessing its properties
        const params = await context.params;
        const chatId = params.id;

        // Basic validation
        if (!chatId) {
            return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
        }

        // Create Supabase client
        const supabase = await createClient();

        // Get the current user from auth
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed counting messages', {
                operation: 'count_chat_messages',
                error: authError?.message || 'No user found'
            });

            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Log the request
        edgeLogger.info('Counting total chat messages', {
            operation: 'count_chat_messages',
            chatId: chatId.slice(0, 8), // Only log partial ID for privacy
            userId: user.id.slice(0, 8)
        });

        // Count the total messages for this chat
        const { count, error } = await supabase
            .from('sd_chat_histories')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', chatId);

        if (error) {
            edgeLogger.error('Error counting chat messages', {
                operation: 'count_chat_messages',
                error: error.message,
                chatId: chatId.slice(0, 8)
            });

            return NextResponse.json({ error: 'Failed to count messages' }, { status: 500 });
        }

        // Log the result
        edgeLogger.info('Successfully counted chat messages', {
            operation: 'count_chat_messages',
            chatId: chatId.slice(0, 8),
            count: count || 0
        });

        return NextResponse.json({ count: count || 0 });
    } catch (error) {
        // Handle unexpected errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        edgeLogger.error('Unexpected error counting chat messages', {
            operation: 'count_chat_messages',
            error: errorMessage
        });

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 