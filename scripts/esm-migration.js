#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Regex patterns for finding CommonJS patterns
const requireRegex = /const\s+(.+?)\s*=\s*require\(['"](.+?)['"]\)/g;
const moduleExportsRegex = /module\.exports\s*=\s*(.+)/g;

// Function to process a file
async function processFile(filePath) {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    
    // Check if the file uses CommonJS patterns
    const hasRequire = requireRegex.test(content);
    const hasModuleExports = moduleExportsRegex.test(content);
    
    // Reset regex lastIndex
    requireRegex.lastIndex = 0;
    moduleExportsRegex.lastIndex = 0;
    
    if (hasRequire || hasModuleExports) {
      console.log(`Found CommonJS patterns in: ${filePath}`);
      
      // Replace require with import
      let updatedContent = content.replace(requireRegex, (match, variable, moduleName) => {
        // Handle destructuring
        if (variable.includes('{')) {
          const destructuredVars = variable.replace(/[{}]/g, '').trim();
          return `import { ${destructuredVars} } from '${moduleName}'`;
        } else {
          return `import ${variable} from '${moduleName}'`;
        }
      });
      
      // Replace module.exports with export default
      updatedContent = updatedContent.replace(moduleExportsRegex, (match, exportValue) => {
        return `export default ${exportValue}`;
      });
      
      return {
        path: filePath,
        hasCommonJS: true,
        content: updatedContent
      };
    }
    
    return {
      path: filePath,
      hasCommonJS: false
    };
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return {
      path: filePath,
      hasCommonJS: false,
      error: error.message
    };
  }
}

// Function to recursively process all JavaScript/TypeScript files in a directory
async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and .next directories
        if (entry.name !== 'node_modules' && entry.name !== '.next') {
          const dirResults = await processDirectory(fullPath);
          results.push(...dirResults);
        }
      } else if (entry.isFile() && 
                (fullPath.endsWith('.js') || 
                 fullPath.endsWith('.ts') || 
                 fullPath.endsWith('.jsx') || 
                 fullPath.endsWith('.tsx'))) {
        const result = await processFile(fullPath);
        if (result.hasCommonJS) {
          results.push(result);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
    return [];
  }
}

// Main function
async function main() {
  console.log('Starting ESM migration analysis...');
  
  try {
    const results = await processDirectory(rootDir);
    
    console.log(`\nFound ${results.length} files with CommonJS patterns:`);
    
    for (const result of results) {
      console.log(`- ${result.path}`);
    }
    
    // Ask if user wants to convert files
    if (results.length > 0) {
      console.log('\nWould you like to convert these files to ESM? (y/n)');
      // In a real script, you would wait for user input here
      // For now, we'll just log the files that would be converted
      
      console.log('\nFiles that would be converted:');
      for (const result of results) {
        console.log(`- ${result.path}`);
        // In a real script, you would write the updated content back to the file
        // await fs.writeFile(result.path, result.content, 'utf8');
      }
    } else {
      console.log('\nNo files with CommonJS patterns found!');
    }
  } catch (error) {
    console.error('Error during ESM migration:', error);
    process.exit(1);
  }
}

main(); 