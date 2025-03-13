# San Diego Project - Development Guide

## Build/Test/Lint Commands
- **Development**: `npm run dev` - Start development server
- **Build**: `npm run build` - Build Next.js application
- **Start**: `npm run start` - Start production server
- **Lint**: `npm run lint` - Run ESLint
- **Test**: `tsx scripts/tests/[test-name].test.ts` - Run specific test
- **Vector Search**: `npm run test:deep-search` - Test deep search functionality
- **Perplexity**: `npm run test:perplexity` - Test perplexity service
- **Tools**: `npm run test:tools` - Test agent tools
- **Website Summarizer**: `npm run test:website-summarizer` - Test website summarizer
- **Admin Check**: `tsx scripts/test-admin-status.ts [optional-user-id]` - Test admin status for users

## Code Style Guidelines
- **Imports**: Use ESM (ES modules) syntax with .js extension in imports, no CommonJS
- **TypeScript**: Strong typing, strict mode enabled, use interfaces/types
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Error Handling**: Use logger.error() for all errors, try/catch in async functions
- **Component Structure**: Server components by default, 'use client' only when needed
- **Logging**: Use structured logging via lib/logger/[specific-logger]
- **State Management**: Use zustand for global state (auth-store.ts, chat-store.ts)
- **ESLint Rules**: No CommonJS, prefer const, import ordering, proper extensions
- **AI SDK**: Use proper streaming and error handling patterns for AI functionality
- **Formatting**: Maintain consistent indentation and spacing in code

Remember to follow Next.js App Router patterns and AI SDK best practices.

## Admin Authentication
- **Authentication Method**: Admin users must have either:
  - An entry in `sd_user_roles` table with `role='admin'`, OR
  - The `is_admin=true` flag in their `sd_user_profiles` record
- **API Routes**: All admin API routes follow the pattern `/api/admin/[resource]`
- **Permission Check**: Use the `isAdmin()` function that checks both tables
- **Debug Issues**: Use `/docs/admin-authentication-fix.md` for troubleshooting
- **Test Script**: Run `tsx scripts/test-admin-status.ts` to verify admin status

Always look for files and directories to exist before creating your own.

Always explain every step that you're doing to the user and update a readme file for the topic or create one if it doesn't exist in the docs folder. 

Never assume that the user knows the most efficient way to operate, so when you're tasked to do something or tasked to make a plan, always look for an alternate, better solution than his.
