import { edgeLogger } from './logger/edge-logger';

const REQUIRED_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  'PERPLEXITY_API_KEY'
] as const;

const OPTIONAL_VARIABLES = [
  'VERCEL_ENV',
  'VERCEL_REGION',
  'NEXT_PUBLIC_VERCEL_ENV'
] as const;

export function validateEnvironment(): boolean {
  const missing = REQUIRED_VARIABLES.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    edgeLogger.error('Missing required environment variables', { 
      missing,
      important: true
    });
    return false;
  }
  
  // Log successful validation without exposing values
  edgeLogger.info('Environment validation passed', { 
    variables: REQUIRED_VARIABLES.map(key => ({
      name: key,
      set: true
    })),
    important: true
  });
  
  return true;
}

export function getEnvironment() {
  return {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    deploymentRegion: process.env.VERCEL_REGION || 'local'
  };
} 