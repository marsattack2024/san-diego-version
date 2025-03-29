import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Simple ping endpoint to wake up serverless functions
 * Used by the chat widget to pre-warm the API infrastructure on load
 */
export async function HEAD() {
    return new Response(null, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

// Ping endpoint to keep edge functions warm
export async function GET(req: NextRequest) {
    try {
        edgeLogger.info('Ping received', {
            timestamp: new Date().toISOString(),
            path: req.nextUrl.pathname
        });

        // Create a wakeup ping to the widget API to keep it warm
        const widgetApiUrl = new URL('/api/widget-chat', req.nextUrl.origin);
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

        return NextResponse.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                widget: widgetStatus
            }
        }, { status: 200 });
    } catch (error) {
        edgeLogger.error('Ping error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });

        return NextResponse.json({
            status: 'error',
            timestamp: new Date().toISOString(),
            message: 'Failed to ping services'
        }, { status: 500 });
    }
} 