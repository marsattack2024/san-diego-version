#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function processFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let updated = false;
    
    // Remove .tsx extensions from imports
    const tsxRegex = /from ['"](.+)\.tsx['"]/g;
    if (tsxRegex.test(content)) {
      content = content.replace(tsxRegex, 'from \'$1\'');
      updated = true;
    }
    
    // Remove .js extensions from imports
    const jsRegex = /from ['"](.+)\.js['"]/g;
    if (jsRegex.test(content)) {
      content = content.replace(jsRegex, 'from \'$1\'');
      updated = true;
    }
    
    // Fix alias imports with .js extension
    const aliasJsRegex = /from ['"]@\/([^'"]+)\.js['"]/g;
    if (aliasJsRegex.test(content)) {
      content = content.replace(aliasJsRegex, 'from \'@/$1\'');
      updated = true;
    }
    
    if (updated) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`Updated imports in: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return false;
  }
}

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

async function main() {
  console.log('Starting ESM migration fixes...');
  
  try {
    // Update tsconfig.json
    const tsconfigPath = path.join(rootDir, 'tsconfig.json');
    const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));
    
    // Update moduleResolution to bundler
    tsconfig.compilerOptions.moduleResolution = 'bundler';
    
    // Remove allowImportingTsExtensions if it exists
    if (tsconfig.compilerOptions.allowImportingTsExtensions) {
      delete tsconfig.compilerOptions.allowImportingTsExtensions;
    }
    
    // Write the updated tsconfig.json
    await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');
    console.log('Updated tsconfig.json');
    
    // Update next.config.mjs
    const nextConfigPath = path.join(rootDir, 'next.config.mjs');
    let nextConfig = await fs.readFile(nextConfigPath, 'utf8');
    
    // Add esmExternals: true to experimental options if it doesn't exist
    if (!nextConfig.includes('esmExternals: true')) {
      nextConfig = nextConfig.replace(
        /experimental:\s*{([^}]*)}/,
        (match, p1) => {
          return `experimental: {${p1}${p1.trim().endsWith(',') ? '' : ','}  esmExternals: true,}`;
        }
      );
      
      await fs.writeFile(nextConfigPath, nextConfig, 'utf8');
      console.log('Updated next.config.mjs');
    }
    
    // Fix middleware.ts
    const middlewarePath = path.join(rootDir, 'middleware.ts');
    let middleware = await fs.readFile(middlewarePath, 'utf8');
    
    // Remove .js extensions from next/server imports
    middleware = middleware.replace(
      /from ['"]next\/server\.js['"]/g,
      'from \'next/server\''
    );
    
    await fs.writeFile(middlewarePath, middleware, 'utf8');
    console.log('Updated middleware.ts');
    
    // Process all TypeScript files in the project
    console.log('Processing TypeScript files...');
    
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
    
    console.log(`ESM migration fixes completed successfully! Updated ${updatedFiles} files.`);
  } catch (error) {
    console.error('Error fixing ESM migration issues:', error);
    process.exit(1);
  }
}

main(); 