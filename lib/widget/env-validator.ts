/**
 * URL utility for widget deployment
 */

/**
 * Get the site URL with improved fallbacks
 * Will prioritize accurate environment variables but provide robust fallbacks
 * @returns The site URL from environment variables or a fallback
 */
export function getSiteUrl(): string {
  // Client-side: Try to use browser origin as most accurate source
  if (typeof window !== 'undefined') {
    const browserOrigin = window.location.origin;

    // Log for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('getSiteUrl (client):', {
        browserOrigin,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '(not set)',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '(not set)'
      });
    }

    // Use browser origin if available, otherwise try env vars
    return browserOrigin ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://marlan.photographytoprofits.com';
  }

  // Server-side: Use environment variables with logging
  if (process.env.NODE_ENV === 'development') {
    console.log('getSiteUrl (server):', {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '(not set)',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '(not set)',
      VERCEL_URL: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '(not set)',
    });
  }

  // Try multiple environment variables with priority
  return process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://marlan.photographytoprofits.com';
} 