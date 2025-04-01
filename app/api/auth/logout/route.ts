import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';

/**
 * Logout endpoint that will clear auth cookies and force re-authentication
 * This will fix issues where cookies aren't being recognized properly
 */
export async function POST(request: Request) {
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

            return NextResponse.json(
                { error: 'Failed to sign out' },
                { status: 500 }
            );
        }

        // Create a response with no-cache headers
        const response = NextResponse.json(
            { success: true, message: 'Signed out successfully' },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }
        );

        return response;
    } catch (error) {
        edgeLogger.error('Error in logout route', {
            category: LOG_CATEGORIES.AUTH,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 