import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Logout endpoint that will clear auth cookies and force re-authentication
 * This will fix issues where cookies aren't being recognized properly
 */
export async function POST(request: Request): Promise<Response> {
    const operationId = `logout_${Date.now()}`;
    try {
        // Get the supabase client
        const supabase = await createRouteHandlerClient();

        // Get current user for logging purposes
        const { data: { user } } = await supabase.auth.getUser();

        // Log the logout attempt
        edgeLogger.info('User logout requested', {
            category: LOG_CATEGORIES.AUTH,
            userId: user?.id ? user.id.substring(0, 10) + '...' : 'unknown'
        });

        // Sign out the user - this will clear auth cookies
        const { error } = await supabase.auth.signOut();

        if (error) {
            edgeLogger.error('Error signing out user', {
                category: LOG_CATEGORIES.AUTH,
                error: error.message,
                important: true
            });

            const errRes = errorResponse('Failed to sign out', error.message, 500);
            return handleCors(errRes, request, true);
        }

        // Return standard success response + CORS
        const response = successResponse({ success: true, message: 'Signed out successfully' });
        return handleCors(response, request, true);
    } catch (error) {
        edgeLogger.error('Error in logout route', {
            category: LOG_CATEGORIES.AUTH,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        const errRes = errorResponse('Internal server error', error instanceof Error ? error.message : String(error), 500);
        return handleCors(errRes, request, true);
    }
} 