#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// Regex patterns for finding imports
const relativeImportRegex = /from\s+['"]\.\.\/\.\.\/\.\.\/([^'"]+)['"]/g;
const oldAliasImportRegex = /from\s+['"]@\/src\/([^'"]+)['"]/g;
const incorrectAliasImportRegex = /from\s+['"]@\/(?!src\/)([^'"]+)['"]/g;

// Function to process a file
async function processFile(filePath) {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    
    // Replace relative imports with alias imports
    let updatedContent = content.replace(relativeImportRegex, (match, p1) => {
      return `from '@/${p1}'`;
    });
    
    // Replace old alias imports (if any)
    updatedContent = updatedContent.replace(oldAliasImportRegex, (match, p1) => {
      return `from '@/${p1}'`;
    });
    
    // Fix incorrect alias imports
    updatedContent = updatedContent.replace(incorrectAliasImportRegex, (match, p1) => {
      return `from '@/${p1}'`;
    });
    
    // Write the file if changes were made
    if (content !== updatedContent) {
      await fs.writeFile(filePath, updatedContent, 'utf8');
      console.log(`Updated imports in: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return false;
  }
}

// Function to recursively process all TypeScript files in a directory
async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let updatedFiles = 0;
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and .next directories
        if (entry.name !== 'node_modules' && entry.name !== '.next') {
          updatedFiles += await processDirectory(fullPath);
        }
      } else if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
        const updated = await processFile(fullPath);
        if (updated) updatedFiles++;
      }
    }
    
    return updatedFiles;
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
    return 0;
  }
}

// Main function
async function main() {
  console.log('Starting import path updates...');
  
  try {
    const updatedFiles = await processDirectory(srcDir);
    console.log(`Completed! Updated imports in ${updatedFiles} files.`);
  } catch (error) {
    console.error('Error updating imports:', error);
    process.exit(1);
  }
}

main(); 