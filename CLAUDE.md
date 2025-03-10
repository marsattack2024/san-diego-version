# San Diego Project - Development Guide

## Build/Test/Lint Commands
- **Development**: `npm run dev` - Start development server
- **Build**: `npm run build` - Build Next.js application
- **Lint**: `npm run lint` - Run ESLint
- **Test**: `tsx scripts/tests/[test-name].test.ts` - Run specific test
- **Vector Search**: `npm run test:deep-search` - Test deep search functionality
- **Perplexity**: `npm run test:perplexity` - Test perplexity service
- **Tools**: `npm run test:tools` - Test agent tools

## Code Style Guidelines
- **Imports**: Use ESM (ES modules) syntax with .js extension in imports
- **TypeScript**: Strong typing, strict mode enabled, use interfaces/types
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Error Handling**: Use logger.error() for all errors, try/catch in async functions
- **Component Structure**: Server components by default, 'use client' only when needed
- **Logging**: Use structured logging via lib/logger/[specific-logger]
- **State Management**: Use zustand for global state (auth-store.ts, chat-store.ts)
- **ESLint Rules**: No CommonJS, prefer const, import ordering, proper extensions
- **AI SDK**: Use proper streaming and error handling patterns for AI functionality

Remember to follow Next.js App Router patterns and AI SDK best practices.

Always look for files and directories to exist before creating your own. 
 