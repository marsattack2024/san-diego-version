/**
 * Environment variable validation utility for widget deployment
 */

const CRITICAL_VARS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
];

const WIDGET_VARS = [
  'WIDGET_ALLOWED_ORIGINS',
  'WIDGET_RATE_LIMIT',
  'WIDGET_RATE_LIMIT_WINDOW'
];

const ALL_REQUIRED_VARS = [...CRITICAL_VARS, 'OPENAI_API_KEY'];

/**
 * Get the site URL with fallbacks
 * @returns The site URL from environment variables or a fallback
 */
export function getSiteUrl(): string {
  // Debug logging in development
  if (process.env.NODE_ENV === 'development' && typeof window === 'undefined') {
    console.log('DEBUG - Environment variables available:', {
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

/**
 * Validates if all critical environment variables are set
 * @returns Object containing validation results
 */
export function validateCriticalEnv() {
  if (typeof window === 'undefined') {
    // Server-side: log all available environment variables for troubleshooting
    console.log('DEBUG - Environment variables validation:', {
      NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      runtime: 'server'
    });
  }
  
  const missing = CRITICAL_VARS.filter(v => !process.env[v]);
  const isValid = missing.length === 0;
  
  if (!isValid && typeof window === 'undefined') {
    console.warn(`⚠️ Missing critical environment variables: ${missing.join(', ')}`);
    console.warn('Widget functionality may be limited!');
  }
  
  return {
    isValid,
    missing,
    message: isValid 
      ? 'All critical environment variables are set'
      : `Missing critical environment variables: ${missing.join(', ')}`
  };
}

/**
 * Validates all required environment variables for full widget functionality
 * @returns Object containing validation results with details
 */
export function validateWidgetEnv() {
  const missing = ALL_REQUIRED_VARS.filter(v => !process.env[v]);
  const missingWidgetVars = WIDGET_VARS.filter(v => !process.env[v]);
  
  const isValid = missing.length === 0;
  const hasWidgetConfig = missingWidgetVars.length === 0;
  
  if (!isValid && typeof window === 'undefined') {
    console.warn(`⚠️ Missing required environment variables: ${missing.join(', ')}`);
    
    if (missingWidgetVars.length > 0) {
      console.warn(`⚠️ Missing widget configuration variables: ${missingWidgetVars.join(', ')}`);
      console.warn('Default values will be used for widget configuration.');
    }
  }
  
  return {
    isValid,
    hasWidgetConfig,
    missing,
    missingWidgetConfig: missingWidgetVars,
    message: isValid 
      ? 'All required environment variables are set'
      : `Missing required environment variables: ${missing.join(', ')}`
  };
}

// Immediately log validation results during module initialization in non-browser environments
if (typeof window === 'undefined') {
  validateWidgetEnv();
} 