#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// Function to calculate relative path between two absolute paths
function getRelativePath(fromFilePath, toImportPath) {
  const fromDir = path.dirname(fromFilePath);
  let relativePath = path.relative(fromDir, path.join(srcDir, toImportPath));
  
  // Ensure the path starts with ./ or ../
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  
  return relativePath;
}

// Function to process a file
async function processFile(filePath) {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    
    // Find all imports with @/ alias
    const aliasImportRegex = /from\s+['"]@\/([^'"]+)['"]/g;
    let match;
    let updatedContent = content;
    let hasChanges = false;
    
    // We need to collect all matches first before replacing
    const matches = [];
    while ((match = aliasImportRegex.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        importPath: match[1]
      });
    }
    
    // Now replace each match with the relative path
    for (const match of matches) {
      const relativePath = getRelativePath(filePath, match.importPath);
      const newImport = `from '${relativePath}'`;
      updatedContent = updatedContent.replace(match.fullMatch, newImport);
      hasChanges = true;
    }
    
    // Write the file if changes were made
    if (hasChanges) {
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
  console.log('Starting conversion of path aliases to relative imports...');
  
  try {
    const updatedFiles = await processDirectory(srcDir);
    console.log(`Completed! Updated imports in ${updatedFiles} files.`);
  } catch (error) {
    console.error('Error updating imports:', error);
    process.exit(1);
  }
}

main(); 