import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Function to recursively get all files in a directory
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('.next')) {
      fileList = getAllFiles(filePath, fileList);
    } else if (
      stat.isFile() && 
      (filePath.endsWith('.ts') || 
       filePath.endsWith('.tsx') || 
       filePath.endsWith('.js') || 
       filePath.endsWith('.jsx'))
    ) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Function to fix imports in a file
function fixImportsInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Fix imports with .js extension
    const importRegex = /import\s+(?:(?:{[^}]*}|\*\s+as\s+[^,\s]+|[^,\s{}]+)(?:\s*,\s*(?:{[^}]*}|\*\s+as\s+[^,\s]+|[^,\s{}]+))*\s*from\s+)?['"]([^'"]+)\.js['"]/g;
    content = content.replace(importRegex, (match, importPath) => {
      modified = true;
      return match.replace(`${importPath}.js`, importPath);
    });
    
    // If the file was modified, write it back
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated imports in: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

// Main function
function main() {
  console.log('Starting ESM import fixes...');
  const allFiles = getAllFiles(rootDir);
  let updatedCount = 0;
  
  allFiles.forEach(file => {
    fixImportsInFile(file);
    updatedCount++;
  });
  
  console.log(`Completed! Processed ${updatedCount} files.`);
}

main(); 