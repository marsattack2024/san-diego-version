import { readFileSync, writeFileSync, readdirSync, statSync, renameSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const componentRenames = {
  'enhanced-chat.tsx': 'chat.tsx',
  'enhanced-chat-renderer.tsx': 'chat-renderer.tsx',
  'enhanced-message-item.tsx': 'message-item.tsx',
  'enhanced-message-list.tsx': 'message-list.tsx',
  'enhanced-chat-context.tsx': 'chat-context.tsx',
  'useEnhancedChat.ts': 'useChat.ts'
};

const importUpdates = {
  '@/components/chat/enhanced-': '@/components/chat/',
  '@/contexts/enhanced-chat-context': '@/contexts/chat-context',
  '@/hooks/useEnhancedChat': '@/hooks/useChat',
  '@/src/': '@/lib/',
  '@/utils/': '@/lib/',
  '@/lib/stores/': '@/stores/',
  '@/middleware/': '@/',
  '@/types/enhanced-message': '@/types/chat/message',
  '@/types/chat': '@/types/chat/chat',
  '@/types/auth': '@/types/auth/auth',
  '@/types/vector': '@/types/vector/vector'
};

function updateImports(content) {
  let updatedContent = content;
  Object.entries(importUpdates).forEach(([oldPath, newPath]) => {
    const regex = new RegExp(oldPath, 'g');
    updatedContent = updatedContent.replace(regex, newPath);
  });
  return updatedContent;
}

function processDirectory(dir) {
  const files = readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.git')) {
      processDirectory(fullPath);
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      // Update file content
      let content = readFileSync(fullPath, 'utf8');
      const updatedContent = updateImports(content);
      
      if (content !== updatedContent) {
        console.log(`Updating imports in: ${fullPath}`);
        writeFileSync(fullPath, updatedContent);
      }
      
      // Rename file if needed
      if (componentRenames[file]) {
        const newPath = join(dir, componentRenames[file]);
        console.log(`Renaming: ${fullPath} -> ${newPath}`);
        renameSync(fullPath, newPath);
      }
    }
  });
}

// Start processing from the root directory
processDirectory(resolve(__dirname, '..')); 