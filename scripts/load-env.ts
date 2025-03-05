import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

// Fallback to .env.test if needed
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.log('Loading test environment variables...');
  config({ path: resolve(process.cwd(), '.env.test') });
}

// Verify required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'OPENAI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('Using placeholder values for testing purposes');
  
  // Set placeholder values for testing
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://example.supabase.co';
  if (!process.env.SUPABASE_KEY) process.env.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test-key';
  if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'sk-test';
}

// Export environment variables
export const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}; 