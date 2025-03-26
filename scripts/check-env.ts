import { config } from 'dotenv';
import path from 'path';

// Only import logger after environment variables are loaded
import { logger } from '../lib/logger';

// Load environment variables from .env file FIRST
config({
  path: path.resolve(process.cwd(), '.env'),
  override: true // Ensure environment variables are overridden
});

const REQUIRED_ENV_VARS = {
  OPENAI_API_KEY: 'Required for generating embeddings',
  NEXT_PUBLIC_SUPABASE_URL: 'Required for Supabase connection',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Required for Supabase connection'
};

export function checkRequiredEnvVars() {
  const missing: string[] = [];
  const envVars: Record<string, string> = {};

  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    const value = process.env[key];
    if (!value) {
      missing.push(`${key} - ${description}`);
    } else {
      // Store the valid env var
      envVars[key] = value;
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(msg => console.error(`• ${msg}`));
    console.error('\nPlease set these environment variables in your .env file:');
    console.error('\n```');
    missing.forEach(msg => {
      const key = msg.split(' - ')[0];
      console.error(`${key}="your-${key.toLowerCase()}-here"`);
    });
    console.error('```\n');
    throw new Error('Missing required environment variables');
  }

  logger.info('Environment variables validated', {
    variables: Object.keys(envVars)
  });

  return envVars;
} 