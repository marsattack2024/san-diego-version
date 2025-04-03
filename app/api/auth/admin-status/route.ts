import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { withAdminAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';

/**
 * GET route to check if the current user has admin status
 * Uses withAdminAuth which verifies the user is authenticated and has the is_admin JWT claim.
 */
export const GET = withAdminAuth(async (user: User, request: Request): Promise<Response> => {
    const operationId = `admin_check_${Date.now().toString(36).substring(2, 7)}`;

    try {
        // User is guaranteed to be authenticated and an admin by the wrapper
        edgeLogger.info('Admin status confirmed via withAdminAuth wrapper (JWT claim)', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            userId: user.id.substring(0, 8) + '...',
            method: 'jwt_claim_via_wrapper'
        });

        // Return success response indicating admin status
        const response = successResponse({
            admin: true, // Confirmed by the wrapper
            authenticated: true,
            userId: user.id,
            source: 'jwt_claim_via_wrapper' // Indicate source was the wrapper check
        });

        // Set a cookie to cache the admin status on the client
        // Note: The main middleware likely sets this already, but setting it here provides robustness.
        response.headers.set('Set-Cookie', `x-is-admin=true; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`);

        // Cache for 30 minutes (1800 seconds)
        response.headers.set('Cache-Control', 'private, max-age=1800');

        return response;

        // --- Removed manual checks as withAdminAuth handles it --- 
        /*
        // Create Supabase client using the server function
        // ... client creation code removed ...

        // Get the current user from the request
        // ... getUser call removed ...

        // 1. Check JWT claims in app_metadata first (most efficient)
        // ... JWT check removed ...

        // 2. Check profile table as fallback
        // ... profile check code removed ...
        */

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
}); 