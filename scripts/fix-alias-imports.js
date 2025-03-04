#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Regex pattern for finding alias imports
const aliasImportRegex = /from ['"]@\/([^'"]+)['"]/g;

// Function to check if a file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Function to process a file
async function processFile(filePath) {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    let updated = false;
    
    // Find alias imports
    let match;
    let updatedContent = content;
    aliasImportRegex.lastIndex = 0;
    
    while ((match = aliasImportRegex.exec(content)) !== null) {
      const [fullMatch, importPath] = match;
      
      // Check if the file exists in src directory
      const srcPath = path.join(rootDir, 'src', importPath);
      const rootPath = path.join(rootDir, importPath);
      
      // If the file exists in the root directory but not in src, update the import
      if (await fileExists(rootPath) && !(await fileExists(srcPath))) {
        console.log(`Found import that should be updated: ${importPath} in ${filePath}`);
        
        // Update the import to use the correct path
        const relativePath = path.relative(path.dirname(filePath), rootPath);
        const normalizedPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
        
        // Replace the import
        updatedContent = updatedContent.replace(
          new RegExp(`from ['"]@/${importPath}['"]`, 'g'),
          `from '${normalizedPath}'`
        );
        
        updated = true;
      }
    }
    
    // Write the file if changes were made
    if (updated) {
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
  console.log('Starting alias import fixes...');
  
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
    const srcDir = path.join(rootDir, 'src');
    try {
      await fs.access(srcDir);
      updatedFiles += await processDirectory(srcDir);
    } catch (error) {
      // src directory doesn't exist, skip it
    }
    
    console.log(`Alias import fixes completed successfully! Updated ${updatedFiles} files.`);
  } catch (error) {
    console.error('Error fixing alias imports:', error);
    process.exit(1);
  }
}

main(); 