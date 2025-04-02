'use client';

import { useEffect } from 'react';
import { useAuth } from '@/utils/supabase/auth-provider';

/**
 * This component sets up authentication headers for all requests
 * to optimize middleware auth checks and reduce the need for full auth verification
 */
export function AuthHeadersSetup() {
  const { user, isAuthenticated, profile } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Intercept fetch requests to add auth headers
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const headers = new Headers(init?.headers || {});

      // Only add auth headers if user is authenticated
      if (isAuthenticated && user?.id) {
        // Don't add these headers for auth-specific requests to prevent conflicts
        const url = typeof input === 'string' ? input :
          input instanceof Request ? input.url :
            input.toString();

        // Check if this is an auth request
        const isAuthRequest = url.includes('/auth/') || url.includes('/login');

        // Expanded check for widget requests to ensure we catch all related endpoints
        const isWidgetRequest =
          url.includes('/api/widget-chat') ||
          url.includes('/widget') ||
          url.includes('/api/ping') ||
          (url.includes('/api/') && url.toLowerCase().includes('widget'));

        // Debug log for development troubleshooting
        if (process.env.NODE_ENV === 'development' && url.includes('widget')) {
          console.debug('Widget URL detected, skipping auth headers:', url);
        }

        // Only add auth headers if this is not an auth or widget request
        if (!isAuthRequest && !isWidgetRequest) {
          headers.set('x-supabase-auth', user.id);
          headers.set('x-auth-time', Date.now().toString());

          // Add profile status if available
          if (profile) {
            headers.set('x-has-profile', 'true');
          } else {
            headers.set('x-has-profile', 'false');
          }
        }
      }

      // Create modified init object with updated headers
      const modifiedInit = { ...init, headers };

      // Call original fetch with new headers
      return originalFetch.call(this, input, modifiedInit);
    };

    // Clean up the override
    return () => {
      window.fetch = originalFetch;
    };
  }, [isAuthenticated, user, profile]);

  // This component doesn't render anything
  return null;
}