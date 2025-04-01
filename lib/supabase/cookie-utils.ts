/**
 * Standardized Cookie Utility for Supabase Authentication
 * 
 * This utility provides consistent cookie handling for authentication across:
 * - Middleware
 * - Server Components
 * - Route Handlers
 * 
 * It ensures proper cookie attributes are set for auth tokens, including:
 * - httpOnly for auth tokens
 * - Appropriate maxAge (7 days for auth tokens)
 * - sameSite=lax for cross-page navigation
 * - secure in production
 */

import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

/**
 * Standard cookie options to be used across all auth cookies
 * Following Supabase SSR best practices
 */
export const getStandardCookieOptions = (name: string): Partial<ResponseCookie> => ({
    path: '/',
    sameSite: 'lax' as 'lax' | 'strict' | 'none',
    secure: process.env.NODE_ENV === 'production',
    // Use longer maxAge and httpOnly for auth tokens
    ...(name.includes('-auth-token') ? {
        maxAge: 60 * 60 * 24 * 7, // 7 days
        httpOnly: true,
    } : {})
});

/**
 * Enhanced cookie setter with consistent options and error handling
 * @param cookieStore The cookie store to set cookies on (can be from various sources)
 * @param name Cookie name
 * @param value Cookie value
 * @param options Additional cookie options to override defaults
 */
export const setEnhancedCookie = (
    cookieStore: any, // Using any due to different cookie store implementations
    name: string,
    value: string,
    options?: Partial<ResponseCookie>
) => {
    try {
        const enhancedOptions = {
            ...getStandardCookieOptions(name),
            ...options,
        };

        cookieStore.set(name, value, enhancedOptions);

        // Log auth cookie operations at debug level
        if (name.includes('-auth-token')) {
            edgeLogger.debug(`Set auth cookie: ${name}`, {
                category: LOG_CATEGORIES.AUTH,
                cookieName: name,
                hasOptions: !!options
            });
        }
    } catch (err) {
        edgeLogger.debug('Error setting cookie', {
            category: LOG_CATEGORIES.AUTH,
            cookieName: name,
            error: err instanceof Error ? err.message : String(err)
        });
    }
};

/**
 * Enhance cookie setting for multiple cookies at once
 * @param cookieStore The cookie store to set cookies on
 * @param cookiesToSet Array of cookies to set
 */
export const setEnhancedCookies = (
    cookieStore: any,
    cookiesToSet: Array<{ name: string; value: string; options?: Partial<ResponseCookie> }>
) => {
    try {
        let authCookieCount = 0;

        cookiesToSet.forEach(({ name, value, options }) => {
            setEnhancedCookie(cookieStore, name, value, options);
            if (name.includes('-auth-token')) authCookieCount++;
        });

        // Log batch operations for auth cookies only
        if (authCookieCount > 0) {
            edgeLogger.debug(`Set ${authCookieCount} auth cookies`, {
                category: LOG_CATEGORIES.AUTH,
                totalCookies: cookiesToSet.length,
                authCookies: authCookieCount
            });
        }
    } catch (error) {
        edgeLogger.error('Error in batch cookie setting', {
            category: LOG_CATEGORIES.AUTH,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

/**
 * Creates a standard cookie handler for Supabase clients
 * This ensures consistent cookie handling across all Supabase client instances
 * @param cookieStore The cookie store to use (from various Next.js sources)
 * @returns A cookie handler compatible with Supabase createServerClient
 */
export const createStandardCookieHandler = (cookieStore: any) => ({
    getAll() {
        return cookieStore.getAll();
    },
    setAll(cookiesToSet: Array<{ name: string; value: string; options?: Partial<ResponseCookie> }>) {
        setEnhancedCookies(cookieStore, cookiesToSet);
    }
}); 