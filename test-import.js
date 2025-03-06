// Simple test to check if we can import the module
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Log the directory structure
console.log('Checking directory structure:');
const perplexityDir = join(__dirname, 'lib/agents/tools/perplexity');
console.log(`Perplexity directory: ${perplexityDir}`);

try {
  // List files in the directory
  const { readdirSync } = await import('fs');
  const files = readdirSync(perplexityDir);
  console.log('Files in perplexity directory:', files);
  
  // Check if the file exists
  const filePath = join(perplexityDir, 'deep-search-tool.ts');
  console.log(`Checking if file exists: ${filePath}`);
  
  const { existsSync } = await import('fs');
  if (existsSync(filePath)) {
    console.log('File exists!');
    
    // Read the file content
    const content = readFileSync(filePath, 'utf8');
    console.log('File content length:', content.length);
    console.log('First 100 characters:', content.substring(0, 100));
  } else {
    console.log('File does not exist!');
  }
} catch (error) {
  console.error('Error:', error);
}