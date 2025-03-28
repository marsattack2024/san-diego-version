import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

/**
 * Debug endpoint for troubleshooting authentication issues
 * Only use this in development and testing
 */
export async function GET(request: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({
            error: 'Debug endpoint disabled in production'
        }, { status: 403 });
    }

    try {
        // Get auth cookies for debugging
        const cookies = request.headers.get('cookie') || '';
        const authCookies = cookies
            .split(';')
            .map(c => c.trim())
            .filter(c => c.startsWith('sb-') || c.includes('-auth-token') || c.startsWith('x-is-admin'));

        // Check if request has headers set by middleware
        const authReady = request.headers.get('x-auth-ready');
        const authReadyTime = request.headers.get('x-auth-ready-time');
        const isAdmin = request.headers.get('x-is-admin');

        // Get auth state from Supabase
        const supabase = await createClient();
        const { data, error: authError } = await supabase.auth.getSession();
        const user = data?.session?.user;
        const session = data?.session;

        // Check admin status using RPC if user exists
        let adminRpcResult = null;
        let adminRpcError = null;

        if (user) {
            try {
                const { data, error } = await supabase.rpc('is_admin', {
                    user_id: user.id
                });

                adminRpcResult = data;
                adminRpcError = error;
            } catch (e) {
                adminRpcError = e instanceof Error ? e.message : String(e);
            }
        }

        // Return debugging information
        return NextResponse.json({
            auth: {
                isAuthenticated: !!user,
                userId: user?.id,
                email: user?.email,
                sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
                sessionError: authError?.message,
            },
            middleware: {
                authReady,
                authReadyTime,
                isAdmin,
            },
            admin: {
                rpcResult: adminRpcResult,
                rpcError: adminRpcError?.toString(),
            },
            cookies: {
                count: authCookies.length,
                // Only show cookie existence, not values
                authCookiesExist: authCookies.map(c => c.split('=')[0])
            },
            headers: Object.fromEntries(
                Array.from(request.headers.entries())
                    .filter(([key]) => key.startsWith('x-') || key === 'user-agent')
            ),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        edgeLogger.error('Error in auth debug endpoint', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        return NextResponse.json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 