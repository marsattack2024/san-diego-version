/**
 * Standardized Supabase Client Utility for Route Handlers
 * 
 * This utility provides a consistent way to create Supabase clients
 * for route handlers with proper cookie handling and error tracking.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createStandardCookieHandler } from './cookie-utils';

/**
 * Creates a standard Supabase client for route handlers
 * with proper cookie handling and error logging that is 
 * compatible with the middleware cookie handling
 * 
 * @returns Promise<SupabaseClient> - A properly configured Supabase client
 */
export async function createRouteHandlerClient(): Promise<SupabaseClient> {
    try {
        // Get the cookie store - must await
        const cookieStore = await cookies();

        // Log the creation attempt
        edgeLogger.debug('Creating route handler Supabase client', {
            category: LOG_CATEGORIES.SYSTEM,
            hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        });

        // IMPORTANT: This must use the identical pattern to our middleware
        // to ensure cookie handling is consistent across the app
        return createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: createStandardCookieHandler(cookieStore)
            }
        );
    } catch (error) {
        // Log the error
        edgeLogger.error('Failed to create route handler Supabase client', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        // Rethrow to allow proper handling in the route handler
        throw error;
    }
}

/**
 * Creates a Supabase admin client for route handlers that need
 * to bypass RLS while maintaining user authentication
 * 
 * @returns Promise<SupabaseClient> - A Supabase client with service role key
 */
export async function createRouteHandlerAdminClient(): Promise<SupabaseClient> {
    try {
        // Get the cookie store - must await
        const cookieStore = await cookies();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

        if (!serviceRoleKey) {
            throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY environment variable');
        }

        // Log the creation attempt
        edgeLogger.debug('Creating route handler Supabase admin client', {
            category: LOG_CATEGORIES.SYSTEM,
            hasServiceRoleKey: !!serviceRoleKey
        });

        // IMPORTANT: This must use the identical pattern to our middleware
        // to ensure cookie handling is consistent across the app
        return createServerClient(
            supabaseUrl,
            serviceRoleKey,
            {
                cookies: createStandardCookieHandler(cookieStore)
            }
        );
    } catch (error) {
        // Log the error
        edgeLogger.error('Failed to create route handler Supabase admin client', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        // Rethrow to allow proper handling in the route handler
        throw error;
    }
} 