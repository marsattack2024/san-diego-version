import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * GET route to check if the current user has admin status
 * This endpoint uses a cached check to avoid repeated RPC calls
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

        // Call the is_admin RPC function to check admin status
        const { data: isAdmin, error } = await supabaseAdmin.rpc('is_admin', {
            user_id: user.id
        });

        if (error) {
            console.error('Error checking admin status', {
                userId: user.id,
                error: error.message,
                important: true
            });

            return NextResponse.json({
                admin: false,
                authenticated: true,
                error: 'Failed to check admin status'
            }, { status: 500 });
        }

        // Set a longer cache time for this response to avoid repeated checks
        const response = NextResponse.json({
            admin: !!isAdmin,
            authenticated: true,
            userId: user.id
        });

        // Cache for 5 minutes (300 seconds)
        response.headers.set('Cache-Control', 'private, max-age=300');

        console.log('Admin status check', {
            userId: user.id,
            isAdmin: !!isAdmin
        });

        return response;
    } catch (error) {
        console.error('Unexpected error in admin status check', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        return NextResponse.json({
            admin: false,
            authenticated: false,
            error: 'Internal server error'
        }, { status: 500 });
    }
} 