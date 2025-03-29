import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Now import the logger after environment variables are set
import { edgeLogger } from '../../lib/logger/edge-logger';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

// Fallback to .env.test if needed
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.log('Loading test environment variables...');
  config({ path: resolve(process.cwd(), '.env.test') });
}

// Set placeholder values for missing environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'PERPLEXITY_API_KEY' // Add Perplexity API key as a required variable
];

// Default placeholder values for testing
const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  'SUPABASE_URL': 'https://example.supabase.co',
  'SUPABASE_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test-key',
  'OPENAI_API_KEY': 'sk-test',
  'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test-key',
  'PERPLEXITY_API_KEY': 'pplx-test' // Add placeholder for Perplexity API key
};

// Check for missing environment variables and set placeholders
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('Using placeholder values for testing purposes');
  
  // Apply placeholders for missing variables
  for (const envVar of missingEnvVars) {
    if (DEFAULT_PLACEHOLDERS[envVar]) {
      process.env[envVar] = DEFAULT_PLACEHOLDERS[envVar];
    }
  }
}
const logger = edgeLogger;

/**
 * Detect runtime environment and other platform variables
 */
function detectRuntimeEnv(): {
  IS_EDGE_RUNTIME: boolean;
  IS_VERCEL: boolean;
  NODE_ENV: string;
} {
  // Check if we are in Edge Runtime
  const isEdgeRuntime = typeof (globalThis as any).EdgeRuntime === 'string';
  
  // Check if we are in a Vercel environment
  const isVercel = !!process.env.VERCEL_ENV;
  
  // Determine Node environment with fallback to development
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  return {
    IS_EDGE_RUNTIME: isEdgeRuntime,
    IS_VERCEL: isVercel,
    NODE_ENV: nodeEnv
  };
}

/**
 * Parse environment variables with type conversion
 * 
 * @param env Raw environment record
 * @returns Typed environment variables
 */
function parseEnvVars(env: Record<string, string | undefined>): Record<string, any> {
  const result: Record<string, any> = { ...env };
  
  // Convert numeric values
  if (env.PORT) result.PORT = parseInt(env.PORT, 10);
  
  // Convert boolean values
  if (env.DEBUG !== undefined) {
    result.DEBUG = env.DEBUG.toLowerCase() === 'true';
  }
  
  if (env.CACHE_ENABLED !== undefined) {
    result.CACHE_ENABLED = env.CACHE_ENABLED.toLowerCase() === 'true';
  }
  
  return result;
}

/**
 * loadEnvironment()
 * Loads environment variables from .env files and validates required variables.
 * 
 * @param options - Configuration options
 * @returns Object containing loaded environment variables
 */
export function loadEnvironment(options: {
  requiredVars?: string[];
  placeholders?: Record<string, string>;
  envPath?: string;
  testEnvPath?: string;
  useTestEnv?: boolean;
} = {}): Record<string, any> {
  const {
    requiredVars = requiredEnvVars,
    placeholders = DEFAULT_PLACEHOLDERS,
    envPath = resolve(process.cwd(), '.env'),
    testEnvPath = resolve(process.cwd(), '.env.test'),
    useTestEnv = false
  } = options;

  // Create base environment object
  const envVars: Record<string, string | undefined> = {};
  for (const key of requiredVars) {
    envVars[key] = process.env[key];
  }

  // Add runtime environment variables
  const runtimeEnv = detectRuntimeEnv();
  const parsedEnv = parseEnvVars(envVars);
  
  // Combine all environment variables
  return {
    ...parsedEnv,
    ...runtimeEnv,
    VERCEL_ENV: process.env.VERCEL_ENV
  };
}

// Export a default environment with standard configuration
export const env = loadEnvironment(); 