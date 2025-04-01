import { createRouteHandlerClient } from "@/lib/supabase/route-client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { edgeLogger } from "@/lib/logger/edge-logger";

export const runtime = 'edge';

/**
 * Debug endpoint to directly fetch history with no circuit breaker
 * This is useful for bypassing the client-side circuit breaker when troubleshooting
 */
export async function GET(request: Request) {
    const operationId = `debug_history_${Math.random().toString(36).substring(2, 8)}`;

    try {
        // Get cookies for diagnostic info
        const cookieStore = cookies();

        // Need to handle cookies specially - Next.js typing is tricky here
        // Using any similar to cookie-utils.ts implementation
        const cookieList = (cookieStore as any).getAll();
        const authCookies = cookieList.filter((c: any) =>
            c.name.includes('sb-') &&
            c.name.includes('-auth-token')
        );

        // Create the client with explicit error handling
        const supabase = await createRouteHandlerClient();

        // Verify that authentication works
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn("Failed to authenticate user in debug history endpoint", {
                operationId,
                error: authError?.message,
                authenticated: !!user,
                hasCookies: authCookies.length > 0
            });

            return NextResponse.json(
                {
                    error: "Not authenticated",
                    details: authError?.message,
                    hasCookies: authCookies.length > 0,
                    cookieCount: cookieList.length
                },
                { status: 401 }
            );
        }

        // Log the authenticated user
        edgeLogger.info("Debug history request", {
            operationId,
            userId: user.id.slice(0, 8) + "..."
        });

        // Directly fetch user's history with no circuit breaker
        const { data, error } = await supabase
            .from("chats")
            .select("*")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(50);

        if (error) {
            edgeLogger.error("Error fetching debug history", {
                operationId,
                error: error.message,
                details: error
            });

            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        // Add debug information
        const debugInfo = {
            timestamp: new Date().toISOString(),
            operationId,
            authenticated: true,
            userId: user.id.slice(0, 8) + "...",
            itemCount: data.length,
            cookieCount: cookieList.length,
            authCookieCount: authCookies.length,
            authCookieNames: authCookies.map((c: any) => c.name)
        };

        // Log the success
        edgeLogger.info("Successfully fetched debug history", {
            operationId,
            count: data.length,
            userId: user.id.slice(0, 8) + "..."
        });

        // Return both the data and debug info
        return NextResponse.json({
            data,
            debug: debugInfo
        });
    } catch (error) {
        edgeLogger.error("Unexpected error in debug history endpoint", {
            operationId,
            error: error instanceof Error ? error.message : String(error)
        });

        return NextResponse.json(
            { error: "Unexpected error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
} 