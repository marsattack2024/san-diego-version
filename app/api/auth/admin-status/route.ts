import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';

/**
 * GET route to check if the current user has admin status
 * This endpoint directly checks the profile table as the single source of truth
 */
export async function GET(request: Request) {
    try {
        // Create Supabase admin client using the server function
        const cookieStore = await cookies();
        const supabaseAdmin = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!,
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
                            console.error('Cookie setting error:', error);
                        }
                    },
                },
            }
        );

        // Get the current user from the request
        const { data: { user } } = await supabaseAdmin.auth.getUser();

        if (!user) {
            return NextResponse.json({
                admin: false,
                authenticated: false,
                error: 'User not authenticated'
            }, { status: 401 });
        }

        // Check profile table directly - single source of truth for admin status
        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if (profileError) {
            edgeLogger.error('Error checking admin status in profile', {
                category: 'auth',
                userId: user.id,
                error: profileError.message,
                level: 'error',
                important: true
            });

            return NextResponse.json({
                admin: false,
                authenticated: true,
                error: 'Failed to check admin status'
            }, { status: 500 });
        }

        const isAdmin = profileData?.is_admin === true;

        // Set a longer cache time for this response to avoid repeated checks
        const response = NextResponse.json({
            admin: isAdmin,
            authenticated: true,
            userId: user.id
        });

        // Cache for 30 minutes (1800 seconds) - increased from previous 5 minutes
        response.headers.set('Cache-Control', 'private, max-age=1800');

        edgeLogger.info('Admin status check', {
            category: 'auth',
            userId: user.id.substring(0, 8) + '...',
            isAdmin: isAdmin,
            level: 'info'
        });

        return response;
    } catch (error) {
        edgeLogger.error('Unexpected error in admin status check', {
            category: 'auth',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
            important: true
        });

        return NextResponse.json({
            admin: false,
            authenticated: false,
            error: 'Internal server error'
        }, { status: 500 });
    }
} 