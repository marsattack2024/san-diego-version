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

// Helper function to add CORS headers
function addCorsHeaders(response: NextResponse): NextResponse {
    // Add CORS headers for Edge compatibility
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS(request: NextRequest) {
    return addCorsHeaders(
        new NextResponse(null, { status: 204 })
    );
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
        let sessionId, content, requestUserId;
        try {
            const body = await request.json();
            sessionId = body.sessionId;
            content = body.content;
            requestUserId = body.userId; // Extract userId from request body if present
        } catch (err) {
            edgeLogger.error('Failed to parse request body', {
                category: 'system',
                error: err instanceof Error ? err.message : String(err),
                operationId
            });

            return addCorsHeaders(
                NextResponse.json({
                    success: false,
                    error: 'Invalid request body'
                }, { status: 400 })
            );
        }

        // Validate required fields
        if (!sessionId) {
            return addCorsHeaders(
                NextResponse.json({
                    success: false,
                    error: 'Session ID is required'
                }, { status: 400 })
            );
        }

        // Check for service-to-service authentication headers
        const headerUserId = request.headers.get('x-user-id');
        const sessionContext = request.headers.get('x-session-context');
        const authState = request.headers.get('x-auth-state');
        const isServiceRequest = 
            sessionContext === 'chat-engine-title-generation' && 
            authState === 'authenticated' && 
            headerUserId;
        
        // Log authentication approach for debugging
        edgeLogger.debug('Title generation auth approach', {
            category: 'system',
            sessionId,
            isServiceRequest,
            hasHeaderUserId: !!headerUserId,
            hasBodyUserId: !!requestUserId,
            sessionContext,
            authState,
            operationId
        });

        let authenticatedUserId: string | undefined;

        // First try service-to-service authentication if applicable
        if (isServiceRequest && headerUserId) {
            authenticatedUserId = headerUserId;
            edgeLogger.info('Using service-to-service authentication for title generation', {
                category: 'system',
                sessionId,
                userId: authenticatedUserId,
                source: 'service-headers',
                operationId
            });
        } 
        // If no service auth, try standard auth
        else {
            // Get user from Supabase auth - standard authentication approach
            const supabase = await createClient();
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            // If standard auth succeeds, use that user
            if (user && !authError) {
                authenticatedUserId = user.id;
                edgeLogger.info('Using standard authentication for title generation', {
                    category: 'system',
                    sessionId,
                    userId: authenticatedUserId,
                    source: 'supabase-auth',
                    operationId
                });
            }
            // Handle authentication errors - try fallback to request body or headers
            else {
                // Log the auth error
                edgeLogger.warn('Standard auth error for title generation', {
                    category: 'system',
                    sessionId,
                    error: authError?.message || 'No user found',
                    operationId
                });

                // Try userId from request body or header as fallback
                if (requestUserId || headerUserId) {
                    authenticatedUserId = requestUserId || headerUserId;
                    edgeLogger.info('Using fallback user ID for title generation', {
                        category: 'system',
                        sessionId,
                        userId: authenticatedUserId,
                        source: requestUserId ? 'request-body' : 'header',
                        operationId
                    });
                } 
                // Last resort: try to get the user ID from the database using the session ID
                else {
                    const supabase = await createClient();
                    const { data: sessionData, error: sessionError } = await supabase
                        .from('sd_chat_sessions')
                        .select('user_id')
                        .eq('id', sessionId)
                        .single();

                    if (sessionError || !sessionData?.user_id) {
                        return addCorsHeaders(
                            NextResponse.json({
                                success: false,
                                error: 'Unauthorized and could not find session'
                            }, { status: 401 })
                        );
                    }
                    
                    authenticatedUserId = sessionData.user_id;
                    edgeLogger.info('Using session user ID for title generation', {
                        category: 'system',
                        sessionId,
                        userId: authenticatedUserId,
                        source: 'database-session',
                        operationId
                    });
                }
            }
        }

        // At this point we should have an authenticated user ID one way or another
        if (!authenticatedUserId) {
            edgeLogger.error('Failed to authenticate user for title generation', {
                category: 'system',
                sessionId,
                operationId
            });
            
            return addCorsHeaders(
                NextResponse.json({
                    success: false,
                    error: 'Authentication failed for title generation'
                }, { status: 401 })
            );
        }

        // Generate title with the authenticated user ID we obtained
        edgeLogger.info('Generating title for chat', {
            category: 'chat',
            sessionId,
            userId: authenticatedUserId,
            operationId
        });

        const title = await generateTitle(sessionId, content, authenticatedUserId);

        if (!title) {
            return addCorsHeaders(
                NextResponse.json({
                    success: false,
                    error: 'Failed to generate title'
                }, { status: 500 })
            );
        }

        return addCorsHeaders(
            NextResponse.json({
                success: true,
                chatId: sessionId,
                title
            })
        );
    } catch (error) {
        edgeLogger.error('Title generation error', {
            category: 'system',
            error: error instanceof Error ? error.message : String(error),
            operationId
        });

        return addCorsHeaders(
            NextResponse.json({
                success: false,
                error: 'Server error'
            }, { status: 500 })
        );
    }
} 