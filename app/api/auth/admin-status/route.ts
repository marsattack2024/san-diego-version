import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

export const runtime = 'edge';

/**
 * GET route to check if the current user has admin status
 * This endpoint directly checks the profile table as the single source of truth
 */
export async function GET(request: Request): Promise<Response> {
    try {
        // Create Supabase admin client using the server function
        const cookieStore = await cookies();
        const supabaseAdmin = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options);
                            });
                        } catch (error) {
                            // This can be ignored in Server Components
                            console.error('Cookie setting error:', error);
                        }
                    },
                },
            }
        );

        // Get the current user from the request
        const { data: { user } } = await supabaseAdmin.auth.getUser();

        if (!user) {
            return unauthorizedError('User not authenticated');
        }

        // Check profile table directly - single source of truth for admin status
        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if (profileError) {
            edgeLogger.error('Error checking admin status in profile', {
                category: LOG_CATEGORIES.AUTH,
                userId: user.id,
                error: profileError.message,
                important: true
            });

            return errorResponse(
                'Failed to check admin status',
                profileError,
                500
            );
        }

        const isAdmin = profileData?.is_admin === true;

        edgeLogger.info('Admin status check', {
            category: LOG_CATEGORIES.AUTH,
            userId: user.id.substring(0, 8) + '...',
            isAdmin: isAdmin
        });

        // Set a longer cache time for this response to avoid repeated checks
        const response = successResponse({
            admin: isAdmin,
            authenticated: true,
            userId: user.id
        });

        // Cache for 30 minutes (1800 seconds) - increased from previous 5 minutes
        response.headers.set('Cache-Control', 'private, max-age=1800');

        return response;
    } catch (error) {
        edgeLogger.error('Unexpected error in admin status check', {
            category: LOG_CATEGORIES.AUTH,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            important: true
        });

        return errorResponse(
            'Internal server error',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
} 