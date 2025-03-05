#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Define directories to check
const directories = [
  'components',
  'public',
  'styles',
];

// Define files to keep (new UI files)
const filesToKeep = [
  // Core UI components
  'chat.tsx',
  'chat-header.tsx',
  'messages.tsx',
  'message.tsx',
  'multimodal-input.tsx',
  'artifact.tsx',
  
  // UI utilities
  'theme-provider.tsx',
  'icons.tsx',
  
  // Shadcn components
  'ui',
  
  // Public assets
  'placeholder-user.jpg',
  'placeholder.jpg',
  'placeholder.svg',
  'placeholder-logo.png',
  'placeholder-logo.svg',
];

// Function to check if a file is used
function isFileUsed(filePath) {
  // Check if file is in the keep list
  const fileName = path.basename(filePath);
  if (filesToKeep.includes(fileName)) {
    console.log(`Keeping file: ${filePath} (in keep list)`);
    return true;
  }
  
  // Check if file is a directory in the keep list
  const dirName = path.basename(path.dirname(filePath));
  if (filesToKeep.includes(dirName)) {
    console.log(`Keeping file: ${filePath} (in directory keep list)`);
    return true;
  }

  // Check if file is imported in any other file
  // This is a simplified version - a real implementation would be more complex
  try {
    // Only check text files
    if (
      filePath.endsWith('.tsx') || 
      filePath.endsWith('.ts') || 
      filePath.endsWith('.js') || 
      filePath.endsWith('.jsx') || 
      filePath.endsWith('.css')
    ) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Get the file name without extension
      const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
      
      // Check if the file is imported anywhere
      const isImported = content.includes(`import`) && 
                         (content.includes(`/${fileNameWithoutExt}'`) || 
                          content.includes(`/${fileNameWithoutExt}"`));
      
      if (isImported) {
        console.log(`Keeping file: ${filePath} (imported in other files)`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    // If there's an error, keep the file to be safe
    return true;
  }
}

// Function to remove unused files
function removeUnusedFiles(directory) {
  try {
    const fullPath = path.join(rootDir, directory);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`Directory does not exist: ${fullPath}`);
      return;
    }
    
    const files = fs.readdirSync(fullPath);
    
    for (const file of files) {
      const filePath = path.join(fullPath, file);
      
      if (fs.statSync(filePath).isDirectory()) {
        // Recursively check subdirectories
        removeUnusedFiles(path.join(directory, file));
      } else {
        // Check if file is used
        if (!isFileUsed(filePath)) {
          console.log(`Removing unused file: ${filePath}`);
          // Actually delete files
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${directory}:`, error);
  }
}

// Run the cleanup
console.log('Starting cleanup of unused assets...');
console.log('Removing unused files...');

for (const directory of directories) {
  console.log(`\nChecking directory: ${directory}`);
  removeUnusedFiles(directory);
}

console.log('\nCleanup complete!'); 