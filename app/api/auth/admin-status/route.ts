import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { withAdminAuth, type AdminAuthenticatedRouteHandler } from '@/lib/auth/with-auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET route to check if the current user has admin status
 * Uses withAdminAuth which verifies the user is authenticated and has the is_admin JWT claim.
 */
const GET_Handler: AdminAuthenticatedRouteHandler = async (request, context) => {
    const { user } = context;
    const operationId = `admin_check_${Date.now().toString(36).substring(2, 7)}`;

    try {
        // User is now passed directly and is guaranteed admin by withAdminAuth
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
        response.headers.set('Set-Cookie', `x-is-admin=true; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`);

        // Cache for 30 minutes (1800 seconds)
        response.headers.set('Cache-Control', 'private, max-age=1800');

        return handleCors(response, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in admin status check', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        const errResponse = errorResponse(
            'Internal server error',
            error instanceof Error ? error.message : String(error),
            500
        );
        return handleCors(errResponse, request, true);
    }
};

// Export the wrapped handler
export const GET = withAdminAuth(GET_Handler); 