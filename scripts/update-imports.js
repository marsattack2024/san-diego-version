#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// Regex patterns for finding imports
const relativeImportRegex = /from\s+['"](\.[^'"]+)['"]/g;
const aliasImportRegex = /from\s+['"]@\/([^'"]+)['"]/g;

// Function to check if a file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Function to resolve the correct extension for a file
async function resolveExtension(basePath, importPath) {
  // If it already has an extension, return it
  if (importPath.endsWith('.js') || importPath.endsWith('.jsx') || 
      importPath.endsWith('.ts') || importPath.endsWith('.tsx') || 
      importPath.endsWith('.json')) {
    return importPath;
  }
  
  // Check for TypeScript extensions first
  const extensions = ['.tsx', '.ts', '.jsx', '.js'];
  for (const ext of extensions) {
    const fullPath = path.resolve(basePath, `${importPath}${ext}`);
    if (await fileExists(fullPath)) {
      // For TypeScript files, we'll add .js extension in imports
      // as they'll be compiled to .js
      if (ext === '.tsx' || ext === '.ts') {
        return `${importPath}.js`;
      } else {
        return `${importPath}${ext}`;
      }
    }
  }
  
  // If no file is found, just add .js as a fallback
  return `${importPath}.js`;
}

// Function to process a file
async function processFile(filePath) {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    const fileDir = path.dirname(filePath);
    
    // We'll collect all the replacements to make
    const replacements = [];
    
    // Find relative imports
    let match;
    relativeImportRegex.lastIndex = 0;
    while ((match = relativeImportRegex.exec(content)) !== null) {
      const [fullMatch, importPath] = match;
      
      // Skip if it's a node_modules import or already has correct extension
      if (importPath.startsWith('./node_modules/') || 
          importPath.startsWith('../node_modules/')) {
        continue;
      }
      
      // Handle Next.js imports specially - don't add extensions to these
      if (importPath.startsWith('./next/') || 
          importPath.startsWith('../next/') ||
          importPath.includes('next/')) {
        continue;
      }
      
      const resolvedPath = await resolveExtension(fileDir, importPath);
      
      // Only add to replacements if we need to change something
      if (resolvedPath !== importPath) {
        replacements.push({
          start: match.index,
          end: match.index + fullMatch.length,
          original: fullMatch,
          replacement: `from '${resolvedPath}'`
        });
      }
    }
    
    // Find alias imports
    aliasImportRegex.lastIndex = 0;
    while ((match = aliasImportRegex.exec(content)) !== null) {
      const [fullMatch, importPath] = match;
      
      // Skip Next.js imports
      if (importPath.includes('next/')) {
        continue;
      }
      
      const resolvedPath = await resolveExtension(rootDir, importPath);
      
      // Only add to replacements if we need to change something
      if (resolvedPath !== importPath) {
        replacements.push({
          start: match.index,
          end: match.index + fullMatch.length,
          original: fullMatch,
          replacement: `from '@/${resolvedPath}'`
        });
      }
    }
    
    // If we have replacements, apply them
    if (replacements.length > 0) {
      // Sort replacements in reverse order to avoid messing up indices
      replacements.sort((a, b) => b.start - a.start);
      
      // Apply replacements
      let updatedContent = content;
      for (const { start, end, original, replacement } of replacements) {
        updatedContent = 
          updatedContent.substring(0, start) + 
          replacement + 
          updatedContent.substring(end);
      }
      
      // Write the file if changes were made
      if (content !== updatedContent) {
        await fs.writeFile(filePath, updatedContent, 'utf8');
        console.log(`Updated imports in: ${filePath}`);
        return true;
      }
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
    // Process the app directory
    const appDir = path.join(rootDir, 'app');
    let updatedFiles = await processDirectory(appDir);
    
    // Process the components directory
    const componentsDir = path.join(rootDir, 'components');
    updatedFiles += await processDirectory(componentsDir);
    
    // Process the contexts directory
    const contextsDir = path.join(rootDir, 'contexts');
    updatedFiles += await processDirectory(contextsDir);
    
    // Process the hooks directory
    const hooksDir = path.join(rootDir, 'hooks');
    updatedFiles += await processDirectory(hooksDir);
    
    // Process the utils directory
    const utilsDir = path.join(rootDir, 'utils');
    updatedFiles += await processDirectory(utilsDir);
    
    // Process the lib directory
    const libDir = path.join(rootDir, 'lib');
    updatedFiles += await processDirectory(libDir);
    
    // Process the src directory if it exists
    try {
      await fs.access(srcDir);
      updatedFiles += await processDirectory(srcDir);
    } catch (error) {
      // src directory doesn't exist, skip it
    }
    
    console.log(`Completed! Updated imports in ${updatedFiles} files.`);
  } catch (error) {
    console.error('Error updating imports:', error);
    process.exit(1);
  }
}

main(); 