/**
 * Handles CORS headers for cross-origin requests, ensuring compatibility with standard Response objects.
 * 
 * @param response - The original Response object.
 * @param req - The incoming Request object to determine the origin.
 * @param corsEnabled - Boolean indicating if CORS should be handled.
 * @returns A new Response object with appropriate CORS headers, or the original response if CORS is disabled.
 */
export function handleCors(response: Response, req: Request, corsEnabled: boolean): Response {
    if (!corsEnabled) {
        return response;
    }

    const origin = req.headers.get('origin') || '';

    // Get allowed origins from environment or use default
    const allowedOrigins = process.env.WIDGET_ALLOWED_ORIGINS
        ? process.env.WIDGET_ALLOWED_ORIGINS.split(',')
        : ['http://localhost:3000']; // Consider making this default configurable

    const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');

    // Clone headers to avoid modifying the original response's headers directly
    const corsHeaders = new Headers(response.headers);

    if (isAllowedOrigin) {
        corsHeaders.set('Access-Control-Allow-Origin', origin);
        // Add Vary header for caching proxies
        corsHeaders.append('Vary', 'Origin');
    } else {
        // Optionally, you might want to return the first allowed origin or handle this case differently
        corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
    }

    corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    corsHeaders.set('Access-Control-Max-Age', '86400'); // 24 hours

    // Return a new Response using the original body and status, but with the modified headers.
    // This preserves the streamable body if it exists.
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: corsHeaders
    });
} 