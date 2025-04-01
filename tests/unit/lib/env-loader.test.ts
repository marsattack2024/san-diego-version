import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original environment variables
const originalEnv = { ...process.env };

describe('Environment Loader', () => {
  // Mock console methods before each test
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    
    // Mock console methods
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // Restore environment variables and console methods after each test
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Required Environment Variables', () => {
    it('should verify presence of critical API keys', async () => {
      // Mock environment variables
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
      vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');
      
      // Import should succeed since required env vars are present
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify env object has the expected properties
      expect(env).toHaveProperty('OPENAI_API_KEY');
      expect(env).toHaveProperty('PERPLEXITY_API_KEY');
      expect(env.OPENAI_API_KEY).toBe('sk-test-key');
      expect(env.PERPLEXITY_API_KEY).toBe('pplx-test-key');
    });
    
    it('should provide default values for optional variables', async () => {
      // Set NODE_ENV to undefined using vi.stubEnv instead of delete
      vi.stubEnv('NODE_ENV', '');
      
      // Import the env loader
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify default value is used
      expect(env).toHaveProperty('NODE_ENV');
      expect(env.NODE_ENV).toBe('development'); // Default value
    });
    
    it('should handle validation failure when critical variables are missing', async () => {
      // Explicitly unset critical API key and capture original
      const originalKey = process.env.OPENAI_API_KEY;
      vi.stubEnv('OPENAI_API_KEY', '');
      
      // Remove it from process.env as well to ensure it's truly missing
      delete process.env.OPENAI_API_KEY;
      
      // Import should still succeed with environment initialization
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify key exists (placeholder or real key)
      expect(env).toHaveProperty('OPENAI_API_KEY');
      expect(typeof env.OPENAI_API_KEY).toBe('string');
      expect(env.OPENAI_API_KEY.length).toBeGreaterThan(0);
      
      // Verify additional behavior
      expect(env.IS_EDGE_RUNTIME).toBe(false);
      expect(env).toHaveProperty('NODE_ENV');
      expect(typeof env.NODE_ENV).toBe('string');
      
      // Restore original key if it existed
      if (originalKey) {
        vi.stubEnv('OPENAI_API_KEY', originalKey);
      }
    });
  });
  
  describe('Runtime Environment Detection', () => {
    it('should detect Node.js runtime', async () => {
      // Import the env loader
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify runtime detection
      expect(env).toHaveProperty('IS_EDGE_RUNTIME');
      expect(env.IS_EDGE_RUNTIME).toBe(false);
    });
    
    it('should detect Edge runtime if EdgeRuntime is defined', async () => {
      // Mock Edge runtime
      (global as any).EdgeRuntime = 'edge';
      
      // Import the env loader
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify Edge runtime detection
      expect(env).toHaveProperty('IS_EDGE_RUNTIME');
      expect(env.IS_EDGE_RUNTIME).toBe(true);
      
      // Clean up
      delete (global as any).EdgeRuntime;
    });
  });
  
  describe('Vercel Environment Detection', () => {
    it('should detect Vercel environment', async () => {
      // Mock Vercel environment
      vi.stubEnv('VERCEL_ENV', 'production');
      
      // Import the env loader
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify Vercel environment detection
      expect(env).toHaveProperty('IS_VERCEL');
      expect(env.IS_VERCEL).toBe(true);
      expect(env.VERCEL_ENV).toBe('production');
    });
    
    it('should identify non-Vercel environment', async () => {
      // Clear Vercel environment using vi.stubEnv instead of delete
      vi.stubEnv('VERCEL_ENV', '');
      
      // Import the env loader
      const { env } = await import('@/scripts/lib/env-loader');
      
      // Verify non-Vercel environment detection
      expect(env).toHaveProperty('IS_VERCEL');
      expect(env.IS_VERCEL).toBe(false);
    });
  });
  
  describe('Type Safety', () => {
    it('should provide type-safe access to environment variables', async () => {
      // Set numeric value directly in process.env
      vi.stubEnv('PORT', '3000');
      
      // Import the env loader
      const { env, loadEnvironment } = await import('@/scripts/lib/env-loader');
      
      // Need to explicitly add PORT to required variables
      const customEnv = loadEnvironment({
        requiredVars: [...(env as any).requiredVars || [], 'PORT']
      });
      
      // Verify type conversion
      expect(customEnv).toHaveProperty('PORT');
      expect(typeof customEnv.PORT).toBe('number');
      expect(customEnv.PORT).toBe(3000);
    });
    
    it('should handle boolean environment variables', async () => {
      // Set boolean values
      vi.stubEnv('DEBUG', 'true');
      vi.stubEnv('CACHE_ENABLED', 'false');
      
      // Import the env loader
      const { env, loadEnvironment } = await import('@/scripts/lib/env-loader');
      
      // Need to explicitly add boolean variables to required variables
      const customEnv = loadEnvironment({
        requiredVars: [...(env as any).requiredVars || [], 'DEBUG', 'CACHE_ENABLED']
      });
      
      // Verify boolean conversion
      expect(typeof customEnv.DEBUG).toBe('boolean');
      expect(customEnv.DEBUG).toBe(true);
      expect(typeof customEnv.CACHE_ENABLED).toBe('boolean');
      expect(customEnv.CACHE_ENABLED).toBe(false);
    });
  });
}); 