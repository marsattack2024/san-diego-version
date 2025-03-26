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
 * Validates if all critical environment variables are set
 * @returns Object containing validation results
 */
export function validateCriticalEnv() {
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

/**
 * Gets the appropriate site URL with fallbacks
 * Should only be called client-side after hydration or with isServer flag
 */
export function getSiteUrl(isServer = typeof window === 'undefined') {
  if (!isServer && typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  }
  
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://marlan.photographytoprofits.com';
}

// Immediately log validation results during module initialization in non-browser environments
if (typeof window === 'undefined') {
  validateWidgetEnv();
} 