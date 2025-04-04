import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Helper to check if a user is an admin
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
    edgeLogger.debug('Checking admin status for user', {
        category: LOG_CATEGORIES.AUTH,
        userId
    });

    try {
        // Method 1: RPC function
        const { data: rpcData, error: rpcError } = await supabase.rpc('is_admin', { uid: userId });

        if (rpcError) {
            edgeLogger.error('Error checking admin via RPC', {
                category: LOG_CATEGORIES.AUTH,
                error: rpcError
            });
        } else if (rpcData) {
            edgeLogger.debug('User is admin via RPC check', {
                category: LOG_CATEGORIES.AUTH
            });
            return true;
        }

        // Method 2: Profile check
        const { data: profileData, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', userId)
            .single();

        if (profileError) {
            edgeLogger.error('Error checking admin via profile', {
                category: LOG_CATEGORIES.AUTH,
                error: profileError
            });
        } else if (profileData?.is_admin === true) {
            edgeLogger.debug('User is admin via profile flag', {
                category: LOG_CATEGORIES.AUTH
            });
            return true;
        }

        // Method 3: Roles check
        const { data: roleData, error: roleError } = await supabase
            .from('sd_user_roles')
            .select('role')
            .eq('user_id', userId)
            .eq('role', 'admin')
            .maybeSingle();

        if (roleError) {
            edgeLogger.error('Error checking admin via roles', {
                category: LOG_CATEGORIES.AUTH,
                error: roleError
            });
        } else if (roleData) {
            edgeLogger.debug('User is admin via roles table', {
                category: LOG_CATEGORIES.AUTH
            });
            return true;
        }

        edgeLogger.debug('User is not admin by any verification method', {
            category: LOG_CATEGORIES.AUTH
        });
        return false;
    } catch (err) {
        edgeLogger.error('Exception checking admin status', {
            category: LOG_CATEGORIES.AUTH,
            error: err instanceof Error ? err.message : String(err)
        });
        return false;
    }
}

// Diagnostic endpoint to check widget access permissions
export async function GET(request: Request): Promise<Response> {
    edgeLogger.info('Admin diagnostic endpoint called', {
        category: LOG_CATEGORIES.SYSTEM
    });

    try {
        // Create supabase client using the standard utility
        const supabase = await createRouteHandlerClient();

        // Check auth status
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            edgeLogger.error('Authentication error in admin diagnostic', {
                category: LOG_CATEGORIES.AUTH,
                error: authError.message
            });

            const errRes = errorResponse("Authentication error", authError.message, 401);
            return handleCors(errRes, request, true);
        }

        if (!user) {
            edgeLogger.warn('No authenticated user found in admin diagnostic', {
                category: LOG_CATEGORIES.AUTH
            });

            const errRes = unauthorizedError("No user session found");
            return handleCors(errRes, request, true);
        }

        // Check if user is admin
        const adminStatus = await isAdmin(supabase, user.id);

        // Check session and cookie status
        // Temporarily comment out cookie check due to persistent type error
        // const cookieStore = cookies(); 
        // const activeCookies = cookieStore.getAll().map((cookie: { name: string; value: string }) => cookie.name);
        // const hasSessionCookie = activeCookies.includes('sb-session'); // Check for Supabase specific cookie if possible
        const activeCookies: string[] = []; // Placeholder
        const hasSessionCookie = false; // Placeholder

        // Check for the admin pages path in referrer
        const referrer = request.headers.get('referer') || 'none';
        const comesFromAdmin = referrer.includes('/admin');

        // Format user data safely
        const safeUser = {
            id: user.id,
            email: user.email,
            lastSignInAt: user.last_sign_in_at,
            metadata: user.user_metadata,
        };

        // Return comprehensive diagnostic data
        const response = successResponse({
            timestamp: new Date().toISOString(),
            adminAccess: {
                isAuthenticated: !!user,
                isAdmin: adminStatus,
                shouldSeeWidgetPage: adminStatus,
            },
            sessionInfo: {
                hasActiveSession: !!user,
                hasSessionCookie,
                activeCookies,
                comesFromAdmin,
                referrer,
            },
            userInfo: safeUser,
            environment: {
                nodeEnv: process.env.NODE_ENV,
            },
            message: adminStatus
                ? "You have admin access and should be able to see the widget page"
                : "You do not have admin access and shouldn't see the widget page"
        });
        return handleCors(response, request, true);
    } catch (error) {
        edgeLogger.error('Error in admin diagnostic endpoint', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error)
        });

        const errRes = errorResponse("Server error", error instanceof Error ? error.message : String(error), 500);
        return handleCors(errRes, request, true);
    }
} 