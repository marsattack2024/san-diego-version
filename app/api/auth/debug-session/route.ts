import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';

export const runtime = 'edge';

/**
 * Debug endpoint for checking authentication state
 * This route will help debug authentication issues by examining cookies and headers
 */
export async function GET(request: Request) {
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
        const response = {
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

        return NextResponse.json(response);
    } catch (error) {
        edgeLogger.error('Error in debug session endpoint', {
            category: 'auth',
            error: error instanceof Error ? error.message : String(error)
        });

        return NextResponse.json(
            { error: 'Failed to check session' },
            { status: 500 }
        );
    }
} 