import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Debug endpoint for checking authentication state
 * This route will help debug authentication issues by examining cookies and headers
 */
export async function GET(request: Request): Promise<Response> {
    const operationId = `debug_session_${Date.now()}`;
    console.log(`[${operationId}] Debug session endpoint called`);

    try {
        // Get the cookie store
        const cookieStore = await cookies();

        // Get all raw cookies
        const allCookies = cookieStore.getAll();

        // Check for Supabase auth cookies
        const authCookies = allCookies.filter(c =>
            c.name.includes('sb-') &&
            c.name.includes('-auth-token')
        );

        // Check auth with Supabase directly
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        // Get auth-related headers
        const headers = Array.from(request.headers)
            .filter(([key]) => key.startsWith('x-'))
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {} as Record<string, string>);

        // Build response with detailed debug info
        const responsePayload = {
            authenticated: !!user,
            userId: user?.id || null,
            email: user?.email || null,
            hasAuthCookies: authCookies.length > 0,
            cookieCount: allCookies.length,
            authCookieNames: authCookies.map(c => c.name),
            authError: authError ? authError.message : null,
            headers
        };

        // Log the response for server-side debugging
        edgeLogger.info('Auth debug request', {
            category: 'auth',
            hasUser: !!user,
            cookieCount: allCookies.length,
            authCookieCount: authCookies.length,
        });

        const response = successResponse(responsePayload);
        return handleCors(response, request, true);
    } catch (error) {
        edgeLogger.error('Error in debug session endpoint', {
            category: 'auth',
            error: error instanceof Error ? error.message : String(error)
        });

        const errRes = errorResponse('Failed to check session', error instanceof Error ? error.message : String(error), 500);
        return handleCors(errRes, request, true);
    }
} 