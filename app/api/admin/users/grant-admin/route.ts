import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';

/**
 * Grant admin privileges to a user
 * This endpoint updates the user's profile and triggers the JWT claim update
 * Only existing admins can grant admin privileges
 */

// Helper to check if a user is an admin
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
    // First check using JWT claim in app_metadata (most efficient)
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (!userError && userData?.user?.app_metadata?.is_admin === true) {
        return true;
    }

    // Fallback to database check
    try {
        const { data, error } = await supabase
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', userId)
            .single();

        if (error) {
            edgeLogger.error('Error checking admin status from database', {
                category: LOG_CATEGORIES.AUTH,
                userId,
                error: error.message
            });
            return false;
        }

        return data?.is_admin === true;
    } catch (error) {
        edgeLogger.error('Exception checking admin status', {
            category: LOG_CATEGORIES.AUTH,
            userId,
            error: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}

/**
 * POST handler for granting admin privileges
 */
export async function POST(request: Request): Promise<Response> {
    const operationId = `grant_admin_${Date.now().toString(36).substring(2, 7)}`;

    try {
        // Create Supabase client
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
                            // This can be safely ignored.
                        }
                    },
                },
            }
        );

        // Verify the current user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return unauthorizedError('Authentication required');
        }

        // Check if current user is an admin
        const isCurrentUserAdmin = await isAdmin(supabase, user.id);
        if (!isCurrentUserAdmin) {
            edgeLogger.warn('Non-admin attempted to grant admin privileges', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                userId: user.id.substring(0, 8) + '...'
            });

            return errorResponse('Forbidden - Admin privileges required', null, 403);
        }

        // Parse request body
        const body = await request.json();
        const { userId, email } = body;

        if (!userId && !email) {
            return errorResponse('Either userId or email is required', null, 400);
        }

        edgeLogger.info('Attempting to grant admin privileges', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            requestedBy: user.id.substring(0, 8) + '...',
            targetUserId: userId?.substring(0, 8) + '...' || null,
            targetEmail: email || null
        });

        let targetUserId = userId;

        // If email is provided but not userId, look up the user
        if (!userId && email) {
            const { data: userData, error: userError } = await supabase
                .from('auth.users')
                .select('id')
                .eq('email', email)
                .single();

            if (userError || !userData) {
                edgeLogger.error('User not found with email', {
                    category: LOG_CATEGORIES.AUTH,
                    operationId,
                    email,
                    error: userError?.message || 'User not found'
                });

                return errorResponse('User not found with provided email', null, 404);
            }

            targetUserId = userData.id;
        }

        // Check if user has a profile
        const { data: profileData, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('id, is_admin')
            .eq('user_id', targetUserId)
            .single();

        if (profileError) {
            edgeLogger.error('Error finding user profile', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                targetUserId: targetUserId.substring(0, 8) + '...',
                error: profileError.message
            });

            return errorResponse('User profile not found', null, 404);
        }

        // If user is already an admin, return success without changes
        if (profileData.is_admin === true) {
            edgeLogger.info('User is already an admin', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                targetUserId: targetUserId.substring(0, 8) + '...'
            });

            return successResponse({
                message: 'User already has admin privileges',
                alreadyAdmin: true,
                success: true
            });
        }

        // Update the profile to set is_admin=true
        // The database trigger will handle updating the JWT claims
        const { error: updateError } = await supabase
            .from('sd_user_profiles')
            .update({ is_admin: true })
            .eq('id', profileData.id);

        if (updateError) {
            edgeLogger.error('Error updating user profile to grant admin status', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                targetUserId: targetUserId.substring(0, 8) + '...',
                error: updateError.message
            });

            return errorResponse(
                'Failed to grant admin privileges',
                updateError.message,
                500
            );
        }

        edgeLogger.info('Admin privileges granted successfully', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            targetUserId: targetUserId.substring(0, 8) + '...',
            grantedBy: user.id.substring(0, 8) + '...'
        });

        return successResponse({
            message: 'Admin privileges granted successfully',
            success: true
        });
    } catch (error) {
        edgeLogger.error('Unexpected error granting admin privileges', {
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