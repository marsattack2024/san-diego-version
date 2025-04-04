import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET route to check if the current user has admin status (using Pattern B - Direct Export)
 */
export async function GET(request: Request): Promise<Response> {
    const operationId = `admin_check_${Date.now().toString(36).substring(2, 7)}`;

    try {
        // Manually create client and check auth
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for admin status check', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(request.url).pathname,
                error: authError?.message || 'No authenticated user',
            });
            // Use standard unauthorizedError + handleCors
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }

        // Manually check admin status
        const isAdmin = user.app_metadata?.is_admin === true;

        if (!isAdmin) {
            edgeLogger.warn('Admin access denied for admin status check', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(request.url).pathname,
                userId: user.id.substring(0, 8) + '...',
            });
            // Use standard errorResponse(403) + handleCors
            const errRes = errorResponse('Admin access required', 'Forbidden', 403);
            return handleCors(errRes, request, true);
        }

        // User is authenticated and admin
        edgeLogger.info('Admin status confirmed via manual check', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            userId: user.id.substring(0, 8) + '...',
            method: 'manual_jwt_claim_check'
        });

        // Return success response using standard utility
        const response = successResponse({
            admin: true,
            authenticated: true,
            userId: user.id,
            source: 'manual_jwt_claim_check'
        });

        // Set headers on the standard response object
        response.headers.set('Set-Cookie', `x-is-admin=true; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`);
        response.headers.set('Cache-Control', 'private, max-age=1800');

        // Wrap final response with CORS
        return handleCors(response, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in admin status handler', {
            category: LOG_CATEGORIES.AUTH,
            operationId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        // Use standard errorResponse + handleCors
        const errRes = errorResponse(
            'Internal server error in admin status handler',
            error instanceof Error ? error.message : String(error),
            500
        );
        return handleCors(errRes, request, true);
    }
} 