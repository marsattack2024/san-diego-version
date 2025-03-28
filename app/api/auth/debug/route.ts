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
        // Check for auth-related headers without logging cookie content
        const authHeaders = {
            ready: request.headers.get('x-auth-ready') || 'false',
            state: request.headers.get('x-auth-state') || 'unknown',
            adminStatus: request.headers.get('x-is-admin') || 'false',
            hasProfile: request.headers.get('x-has-profile') || 'false',
            hasAuthCookies: request.headers.get('x-has-auth-cookies') || 'unknown'
        };

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

        // Return debugging information without exposing cookie details
        return NextResponse.json({
            auth: {
                isAuthenticated: !!user,
                userId: user?.id,
                email: user?.email ? true : false, // Only indicate presence, not value
                sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
                hasError: !!authError,
            },
            middleware: authHeaders,
            admin: {
                rpcResult: adminRpcResult,
                rpcError: adminRpcError?.toString(),
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
            stack: error instanceof Error ? error.stack : undefined,
            category: 'auth',
            important: true
        });

        return NextResponse.json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 