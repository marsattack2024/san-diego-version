export const runtime = 'edge';

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

export async function GET() {
    return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0'
        }
    });
} 