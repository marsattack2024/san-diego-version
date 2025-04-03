import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

export const runtime = 'edge';

/**
 * GET route to check if the current user has admin status
 * This endpoint prioritizes checking JWT claims in app_metadata,
 * then falls back to checking the profile table
 */
export async function GET(request: Request): Promise<Response> {
    const operationId = `admin_check_${Date.now().toString(36).substring(2, 7)}`;

    try {
        // Create Supabase client using the server function
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
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options);
                            });
                        } catch (error) {
                            // This can be ignored in Server Components
                        }
                    },
                },
            }
        );

        // Get the current user from the request
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            edgeLogger.warn('User not authenticated for admin check', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                error: userError?.message
            });
            return unauthorizedError('User not authenticated');
        }

        edgeLogger.debug('Checking admin status', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            userId: user.id.substring(0, 8) + '...'
        });

        // 1. Check JWT claims in app_metadata first (most efficient)
        const jwtAdmin = user.app_metadata?.is_admin === true;

        if (jwtAdmin) {
            edgeLogger.info('Admin status confirmed via JWT claim', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                userId: user.id.substring(0, 8) + '...',
                method: 'jwt_claim'
            });

            // Set a cookie to cache the admin status on the client
            const response = successResponse({
                admin: true,
                authenticated: true,
                userId: user.id,
                source: 'jwt_claim'
            });

            // Set cookie for client-side caching - 1 hour expiry
            response.headers.set('Set-Cookie', `x-is-admin=true; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`);

            // Cache for 30 minutes (1800 seconds)
            response.headers.set('Cache-Control', 'private, max-age=1800');

            return response;
        }

        // 2. Check profile table as fallback
        edgeLogger.debug('No JWT admin claim, checking profile table', {
            category: LOG_CATEGORIES.AUTH,
            operationId
        });

        const { data: profileData, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if (profileError) {
            edgeLogger.error('Error checking admin status in profile', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                userId: user.id.substring(0, 8) + '...',
                error: profileError.message
            });

            return errorResponse(
                'Failed to check admin status',
                profileError,
                500
            );
        }

        const isAdmin = profileData?.is_admin === true;

        edgeLogger.info('Admin status check completed', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            userId: user.id.substring(0, 8) + '...',
            isAdmin,
            method: 'profile_check'
        });

        // Set a longer cache time for this response to avoid repeated checks
        const response = successResponse({
            admin: isAdmin,
            authenticated: true,
            userId: user.id,
            source: 'profile_table'
        });

        // Set cookie for client-side caching - 1 hour expiry
        response.headers.set('Set-Cookie',
            `x-is-admin=${isAdmin ? 'true' : 'false'}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`
        );

        // Cache for 30 minutes (1800 seconds)
        response.headers.set('Cache-Control', 'private, max-age=1800');

        return response;
    } catch (error) {
        edgeLogger.error('Unexpected error in admin status check', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        return errorResponse(
            'Internal server error',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
} 