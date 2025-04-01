import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';

export async function GET(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    try {
        const { id: chatId } = await params;
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');

        // Basic validation
        if (!chatId) {
            return errorResponse('Chat ID is required', null, 400);
        }

        if (isNaN(page) || page < 1) {
            return errorResponse('Invalid page number', null, 400);
        }

        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            return errorResponse('Invalid page size', null, 400);
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

            return unauthorizedError();
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

            return errorResponse('Failed to fetch messages', error);
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

        return successResponse(messages);
    } catch (error) {
        // Handle unexpected errors
        return errorResponse('Unexpected error fetching paginated messages', error);
    }
} 