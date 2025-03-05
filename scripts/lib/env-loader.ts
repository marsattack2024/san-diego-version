import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
];

// Default placeholder values for testing
const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  'SUPABASE_URL': 'https://example.supabase.co',
  'SUPABASE_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test-key',
  'OPENAI_API_KEY': 'sk-test',
  'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test-key'
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

// Now import the logger after environment variables are set
import { edgeLogger } from '../../lib/logger/edge-logger';
const logger = edgeLogger;

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
} = {}): Record<string, string | undefined> {
  const {
    requiredVars = requiredEnvVars,
    placeholders = DEFAULT_PLACEHOLDERS,
    envPath = resolve(process.cwd(), '.env'),
    testEnvPath = resolve(process.cwd(), '.env.test'),
    useTestEnv = false
  } = options;

  // Environment variables are already loaded at the top of the file
  // This function now just returns the current environment state
  
  // Create and return environment object
  const env: Record<string, string | undefined> = {};
  for (const key of requiredVars) {
    env[key] = process.env[key];
  }

  return env;
}

// Export a default environment with standard configuration
export const env = loadEnvironment(); 