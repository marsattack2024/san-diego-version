import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';

export async function GET(
    request: NextRequest,
    { params }: { params: { chatId: string } }
): Promise<NextResponse> {
    try {
        const chatId = params.chatId;
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');

        // Basic validation
        if (!chatId) {
            return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
        }

        if (isNaN(page) || page < 1) {
            return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
        }

        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            return NextResponse.json({ error: 'Invalid page size' }, { status: 400 });
        }

        // Create Supabase client
        const supabase = await createClient();

        // Get the current user from auth
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed fetching messages', {
                operation: 'fetch_paginated_messages',
                error: authError?.message || 'No user found'
            });

            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Calculate offset for pagination
        const offset = (page - 1) * pageSize;

        // Log the request
        edgeLogger.info('Fetching paginated messages', {
            operation: 'fetch_paginated_messages',
            chatId: chatId.slice(0, 8), // Only log partial ID for privacy
            page,
            pageSize,
            offset,
            userId: user.id.slice(0, 8)
        });

        // Query the database for the messages
        const { data, error } = await supabase
            .from('sd_chat_histories')
            .select('*')
            .eq('session_id', chatId)
            .order('created_at', { ascending: true }) // Oldest first
            .range(offset, offset + pageSize - 1);

        if (error) {
            edgeLogger.error('Error fetching paginated messages', {
                operation: 'fetch_paginated_messages',
                error: error.message,
                chatId: chatId.slice(0, 8),
                page,
                pageSize
            });

            return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
        }

        // Transform database records to Message format
        const messages: Message[] = data.map((record: any) => ({
            id: record.id,
            role: record.role,
            content: record.content,
            createdAt: record.created_at
        }));

        // Log the result
        edgeLogger.info('Successfully fetched paginated messages', {
            operation: 'fetch_paginated_messages',
            chatId: chatId.slice(0, 8),
            page,
            pageSize,
            count: messages.length
        });

        return NextResponse.json(messages);
    } catch (error) {
        // Handle unexpected errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        edgeLogger.error('Unexpected error fetching paginated messages', {
            operation: 'fetch_paginated_messages',
            error: errorMessage
        });

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 