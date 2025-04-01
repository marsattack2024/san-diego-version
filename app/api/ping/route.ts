import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Simple ping endpoint to wake up serverless functions
 * Used by the chat widget to pre-warm the API infrastructure on load
 */
export async function HEAD(): Promise<Response> {
    return new Response(null, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

// Ping endpoint to keep edge functions warm
export async function GET(req: Request): Promise<Response> {
    try {
        edgeLogger.info('Ping received', {
            timestamp: new Date().toISOString(),
            path: new URL(req.url).pathname
        });

        // Create a wakeup ping to the widget API to keep it warm
        const widgetApiUrl = new URL('/api/widget-chat', new URL(req.url).origin);
        const wakeupResponse = await fetch(widgetApiUrl.toString(), {
            method: 'GET',
            headers: {
                'x-wakeup-ping': 'true',
                'Content-Type': 'application/json'
            }
        });

        let widgetStatus = 'unknown';
        if (wakeupResponse.ok) {
            const data = await wakeupResponse.json();
            widgetStatus = data.status || 'responded';
        } else {
            widgetStatus = `error: ${wakeupResponse.status}`;
        }

        return successResponse({
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                widget: widgetStatus
            }
        });
    } catch (error) {
        edgeLogger.error('Ping error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });

        return errorResponse(
            'Failed to ping services',
            error,
            500
        );
    }
} 