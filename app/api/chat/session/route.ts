import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { z } from 'zod';
import { headers } from 'next/headers';

// const logger = getLogger('api:chat:session');

const sessionSchema = z.object({
    id: z.string().uuid(),
    title: z.string().optional(),
    agentId: z.string().optional(),
    deepSearchEnabled: z.boolean().optional()
});

/**
 * POST handler to create a new chat session
 */
export async function POST(req: NextRequest) {
    const operationId = `create_session_${Math.random().toString(36).substring(2, 10)}`;

    edgeLogger.debug('Creating new chat session', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'session_create',
        operationId
    });

    try {
        const body = await req.json();
        edgeLogger.debug('Request body', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'session_create',
            operationId,
            body
        });

        const result = sessionSchema.safeParse(body);
        if (!result.success) {
            edgeLogger.error('Invalid request body', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'session_create_error',
                operationId,
                errors: result.error.format()
            });
            return NextResponse.json(
                { error: 'Invalid request body', details: result.error.format() },
                { status: 400 }
            );
        }

        const { id, title, agentId, deepSearchEnabled } = result.data;

        if (!id) {
            edgeLogger.error('Missing session ID', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'session_create_error',
                operationId
            });
            return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
        }

        // Authenticate user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed creating session', {
                category: LOG_CATEGORIES.AUTH,
                operation: 'session_create_error',
                operationId,
                error: authError?.message || 'No user found'
            });

            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Create the session
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .insert({
                id,
                title: title || 'Untitled Conversation',
                user_id: user.id,
                agent_id: agentId,
                deep_search_enabled: deepSearchEnabled || false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (sessionError) {
            edgeLogger.error('Error creating chat session', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'session_create_error',
                operationId,
                sessionId: id,
                error: sessionError.message,
                important: true
            });

            return NextResponse.json(
                { error: 'Error creating chat session', details: sessionError.message },
                { status: 500 }
            );
        }

        edgeLogger.info('Chat session created successfully', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'session_create_success',
            operationId,
            sessionId: id
        });

        return NextResponse.json(sessionData);
    } catch (error) {
        edgeLogger.error('Unexpected error creating chat session', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'session_create_error',
            operationId,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        return NextResponse.json(
            { error: 'Unexpected error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

/**
 * GET handler to retrieve all sessions for the authenticated user
 */
export async function GET(req: NextRequest) {
    const operationId = `get_sessions_${Math.random().toString(36).substring(2, 10)}`;

    edgeLogger.debug('Retrieving chat sessions', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'sessions_get',
        operationId
    });

    try {
        // Authenticate user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed getting sessions', {
                category: LOG_CATEGORIES.AUTH,
                operation: 'sessions_get_error',
                operationId,
                error: authError?.message || 'No user found'
            });

            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get sessions
        const { data: sessions, error: sessionsError } = await supabase
            .from('sd_chat_sessions')
            .select('id, title, created_at, updated_at, agent_id, deep_search_enabled')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (sessionsError) {
            edgeLogger.error('Error fetching chat sessions', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'sessions_get_error',
                operationId,
                error: sessionsError.message,
                important: true
            });

            return NextResponse.json(
                { error: 'Error fetching chat sessions', details: sessionsError.message },
                { status: 500 }
            );
        }

        edgeLogger.info('Chat sessions fetched successfully', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'sessions_get_success',
            operationId,
            sessionCount: sessions.length
        });

        return NextResponse.json(sessions);
    } catch (error) {
        edgeLogger.error('Unexpected error fetching chat sessions', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'sessions_get_error',
            operationId,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        return NextResponse.json(
            { error: 'Unexpected error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
} 