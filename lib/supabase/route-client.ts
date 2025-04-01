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

/**
 * Creates a standard Supabase client for route handlers
 * with proper cookie handling and error logging
 * 
 * @returns Promise<SupabaseClient> - A properly configured Supabase client
 */
export async function createRouteHandlerClient(): Promise<SupabaseClient> {
    try {
        // Get cookies - make sure to await this
        const cookieStore = await cookies();

        // Log the creation attempt
        edgeLogger.debug('Creating route handler Supabase client', {
            category: LOG_CATEGORIES.SYSTEM,
            hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        });

        return createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch (error) {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                            edgeLogger.debug('Cookie set failed in Server Component (expected)', {
                                category: LOG_CATEGORIES.SYSTEM,
                                error: error instanceof Error ? error.message : String(error)
                            });
                        }
                    }
                }
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
        // Get cookies - make sure to await this
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

        return createServerClient(
            supabaseUrl,
            serviceRoleKey,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch (error) {
                            // This can be ignored in Server Components
                            edgeLogger.debug('Cookie set failed in Server Component (expected)', {
                                category: LOG_CATEGORIES.SYSTEM,
                                error: error instanceof Error ? error.message : String(error)
                            });
                        }
                    }
                }
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