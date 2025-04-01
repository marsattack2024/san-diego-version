import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

export const runtime = 'edge';

export async function POST(request: Request): Promise<Response> {
    try {
        // Get cookies - make sure to await this
        const cookieStore = await cookies();

        const supabase = createServerClient(
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
                    },
                },
            }
        );

        // User authentication
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return unauthorizedError('Authentication required');
        }

        // Parse the incoming request data
        const body = await request.json();
        const { chatId, newTitle } = body;

        // Input validation
        if (!chatId) {
            return errorResponse('Chat ID is required', null, 400);
        }

        if (!newTitle || typeof newTitle !== 'string' || newTitle.trim().length === 0) {
            return errorResponse('Valid title is required', null, 400);
        }

        // Limit title length to something reasonable
        const trimmedTitle = newTitle.trim().substring(0, 255);

        edgeLogger.info('Attempting to update chat title', {
            category: LOG_CATEGORIES.CHAT,
            chatId,
            userId: user.id
        });

        // Check if the chat exists and belongs to the user
        const { data: chatData, error: chatError } = await supabase
            .from('sd_chats')
            .select('id, user_id')
            .eq('id', chatId)
            .single();

        if (chatError) {
            edgeLogger.error('Error retrieving chat', {
                category: LOG_CATEGORIES.CHAT,
                chatId,
                userId: user.id,
                error: chatError.message
            });

            return errorResponse('Chat not found', chatError.message, 404);
        }

        // Verify ownership
        if (chatData.user_id !== user.id) {
            edgeLogger.warn('Unauthorized chat title update attempt', {
                category: LOG_CATEGORIES.CHAT,
                chatId,
                userId: user.id,
                chatOwnerId: chatData.user_id
            });

            return errorResponse('You do not have permission to modify this chat', null, 403);
        }

        // Update the chat title
        const { error: updateError } = await supabase
            .from('sd_chats')
            .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
            .eq('id', chatId);

        if (updateError) {
            edgeLogger.error('Error updating chat title', {
                category: LOG_CATEGORIES.CHAT,
                chatId,
                userId: user.id,
                error: updateError.message
            });

            return errorResponse('Failed to update chat title', updateError.message, 500);
        }

        edgeLogger.info('Chat title updated successfully', {
            category: LOG_CATEGORIES.CHAT,
            chatId,
            userId: user.id
        });

        return successResponse({
            success: true,
            message: 'Chat title updated successfully',
            chatId,
            title: trimmedTitle
        });
    } catch (error) {
        edgeLogger.error('Exception in update-title route', {
            category: LOG_CATEGORIES.CHAT,
            error: error instanceof Error ? error.message : String(error)
        });

        return errorResponse(
            'Failed to update chat title',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
} 