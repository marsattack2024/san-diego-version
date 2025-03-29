import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateAndSaveChatTitle } from '@/lib/chat/title-service';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { generateShortId } from '@/lib/utils/uuid';

// Helper function to get a title
async function generateTitle(sessionId: string, content: string, userId: string): Promise<string | null> {
    try {
        // Call the title service
        await generateAndSaveChatTitle(sessionId, content, userId);

        // Fetch the generated title from the database
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('sd_chat_sessions')
            .select('title')
            .eq('id', sessionId)
            .single();

        if (error || !data) {
            edgeLogger.error('Failed to fetch generated title', {
                category: 'system',
                error: error?.message || 'No data returned',
                sessionId
            });
            return null;
        }

        return data.title;
    } catch (error) {
        edgeLogger.error('Error generating title', {
            category: 'system',
            error: error instanceof Error ? error.message : String(error),
            sessionId
        });
        return null;
    }
}

/**
 * POST handler for the title update API
 * 
 * This endpoint generates and saves a title for a chat session
 * - Requires authentication
 * - Takes sessionId and optional content for title generation
 * - Returns the generated title
 */
export async function POST(request: NextRequest) {
    const operationId = generateShortId();

    try {
        // Parse request body
        const { sessionId, content } = await request.json();

        // Validate required fields
        if (!sessionId) {
            return NextResponse.json({
                success: false,
                error: 'Session ID is required'
            }, { status: 400 });
        }

        // Get user
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            edgeLogger.warn('Unauthorized title generation attempt', {
                sessionId,
                operationId
            });

            return NextResponse.json({
                success: false,
                error: 'Unauthorized'
            }, { status: 401 });
        }

        // Generate title
        edgeLogger.info('Generating title for chat', {
            category: 'chat',
            sessionId,
            userId: user.id,
            operationId
        });

        const title = await generateTitle(sessionId, content, user.id);

        if (!title) {
            return NextResponse.json({
                success: false,
                error: 'Failed to generate title'
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            chatId: sessionId,
            title
        });
    } catch (error) {
        edgeLogger.error('Title generation error', {
            category: 'system',
            error: error instanceof Error ? error.message : String(error),
            operationId
        });

        return NextResponse.json({
            success: false,
            error: 'Server error'
        }, { status: 500 });
    }
} 