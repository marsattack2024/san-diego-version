/**
 * Environment variables test script
 * Tests environment variable access and visibility in the current environment
 */

import { env } from '../lib/env-loader';
import { fileURLToPath } from 'url';

/**
 * Tests environment variables visibility and accessibility
 */
async function testEnvironmentVariables(): Promise<void> {
  console.log('📋 Environment Variables Test');
  console.log('============================');
  
  // Get environment info
  const envVars = {
    hasPerplexityKey: !!process.env.PERPLEXITY_API_KEY,
    keyLength: process.env.PERPLEXITY_API_KEY?.length || 0,
    keyPrefix: process.env.PERPLEXITY_API_KEY?.substring(0, 5) || 'none',
    keySuffix: process.env.PERPLEXITY_API_KEY?.slice(-5) || 'none',
    runtime: typeof globalThis.process?.release?.name === 'string' ? 'node' : 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
    vercelEnv: process.env.VERCEL_ENV || 'local',
  };

  // Display environment variable summary
  console.log('\n🌐 Environment Information:');
  console.log(`  • Runtime: ${envVars.runtime}`);
  console.log(`  • Node Environment: ${envVars.nodeEnv}`);
  console.log(`  • Vercel Environment: ${envVars.vercelEnv}`);
  
  // Test critical API keys
  console.log('\n🔑 API Keys:');
  console.log(`  • OpenAI API Key: ${!!process.env.OPENAI_API_KEY ? 'Present' : 'Missing'}`);
  console.log(`  • Perplexity API Key: ${envVars.hasPerplexityKey ? 'Present' : 'Missing'}`);
  if (envVars.hasPerplexityKey) {
    console.log(`    > Length: ${envVars.keyLength}`);
    console.log(`    > Format: ${envVars.keyPrefix}...${envVars.keySuffix}`);
  }
  
  // Test Supabase connection variables
  console.log('\n🗄️ Supabase Configuration:');
  console.log(`  • Supabase URL: ${!!process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing'}`);
  console.log(`  • Supabase Anon Key: ${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'}`);
  console.log(`  • Supabase Service Role Key: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Present' : 'Missing'}`);
  
  // List non-sensitive environment variables
  console.log('\n📚 Other Environment Variables:');
  const safeKeys = Object.keys(process.env).filter(key => 
    !key.includes('SECRET') && 
    !key.includes('TOKEN') && 
    !key.includes('PASSWORD') &&
    !key.includes('KEY')
  );
  
  safeKeys.forEach(key => {
    console.log(`  • ${key}: ${process.env[key]}`);
  });
  
  console.log('\n✅ Environment test completed');
}

// Run the test if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testEnvironmentVariables().catch(err => {
    console.error('❌ Environment test failed:', err);
    process.exit(1);
  });
}

// Export for use in the test runner
export const tests = [
  { name: 'Environment Variables', fn: testEnvironmentVariables }
]; 