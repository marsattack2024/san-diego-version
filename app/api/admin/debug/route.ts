import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
    console.log("[DEBUG API] Checking admin status for user:", userId);

    try {
        // Method 1: RPC function
        const { data: rpcData, error: rpcError } = await supabase.rpc('is_admin', { uid: userId });

        if (rpcError) {
            console.error("[DEBUG API] Error checking admin via RPC:", rpcError);
        } else if (rpcData) {
            console.log("[DEBUG API] User is admin via RPC check");
            return true;
        }

        // Method 2: Profile check
        const { data: profileData, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', userId)
            .single();

        if (profileError) {
            console.error("[DEBUG API] Error checking admin via profile:", profileError);
        } else if (profileData?.is_admin === true) {
            console.log("[DEBUG API] User is admin via profile flag");
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
            console.error("[DEBUG API] Error checking admin via roles:", roleError);
        } else if (roleData) {
            console.log("[DEBUG API] User is admin via roles table");
            return true;
        }

        console.log("[DEBUG API] User is not admin by any verification method");
        return false;
    } catch (err) {
        console.error("[DEBUG API] Exception checking admin status:", err);
        return false;
    }
}

// Diagnostic endpoint to check widget access permissions
export async function GET(request: NextRequest): Promise<Response> {
    console.log("[WIDGET-DEBUG] Diagnostic endpoint called");

    try {
        // Create supabase client with proper Next.js 15 cookie handling
        const cookieStore = await cookies();
        const supabase = createSupabaseServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    async getAll() {
                        return await cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        );

        // Check auth status
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error("[WIDGET-DEBUG] Authentication error:", authError);
            return NextResponse.json(
                { error: "Authentication error", message: authError.message },
                { status: 401 }
            );
        }

        if (!user) {
            console.log("[WIDGET-DEBUG] No authenticated user found");
            return NextResponse.json(
                { error: "Not authenticated", message: "No user session found" },
                { status: 401 }
            );
        }

        // Check if user is admin
        const adminStatus = await isAdmin(supabase, user.id);

        // Check session and cookie status
        const activeCookies = cookieStore.getAll().map(cookie => cookie.name);
        const hasSessionCookie = activeCookies.includes('sb-session');

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
        return NextResponse.json({
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
    } catch (error) {
        console.error("[WIDGET-DEBUG] Error in diagnostic endpoint:", error);
        return NextResponse.json(
            { error: "Server error", message: String(error) },
            { status: 500 }
        );
    }
} 