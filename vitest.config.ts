import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    // Global test setup
    setupFiles: ['./tests/setup.ts'],
    
    // Environment
    environment: 'node',
    
    // Directory where tests are located
    include: ['./tests/**/*.test.ts'],
    
    // Exclude node_modules
    exclude: ['**/node_modules/**'],
    
    // Global timeout
    testTimeout: 10000,
    
    // Report slow tests
    slowTestThreshold: 1000,
    
    // Retry failing tests
    retry: 0,
    
    // Clear mock calls between tests
    clearMocks: true,
    
    // Code coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
    },
  },
  
  // Path aliases to match tsconfig
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
}); 