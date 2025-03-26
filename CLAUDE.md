Code Style Guidelines

Imports: Use ESM (ES modules) syntax with .js extension in imports, no CommonJS
TypeScript: Strong typing, strict mode enabled, use interfaces/types
Naming: camelCase for variables/functions, PascalCase for components/classes
Error Handling: Use logger.error() for all errors, try/catch in async functions
Component Structure: Server components by default, 'use client' only when needed
Logging: Use structured logging via lib/logger/[specific-logger]
State Management: Use zustand for global state (auth-store.ts, chat-store.ts)
ESLint Rules: No CommonJS, prefer const, import ordering, proper extensions
AI SDK: Use proper streaming and error handling patterns for AI functionality
Formatting: Maintain consistent indentation and spacing in code

Admin Authentication

Authentication Method: Admin users must have either:

An entry in sd_user_roles table with role='admin', OR
The is_admin=true flag in their sd_user_profiles record


API Routes: All admin API routes follow the pattern /api/admin/[resource]
Permission Check: Use the isAdmin() function that checks both tables
Debug Issues: Use /docs/admin-authentication-fix.md for troubleshooting
Test Script: Run tsx scripts/test-admin-status.ts to verify admin status

Development Workflow Guidelines
Project Navigation & Understanding

Map Project First: Always explore and document existing folders/files before any work
Search Commands:
bashCopy# List directories and files
ls -la path/to/directory

# Find files by name pattern
find . -name "*.tsx" | grep component-name

# Search file content
grep -r "functionName" --include="*.ts" ./src

Read Completely: Examine entire files to understand implementation patterns
Documentation Check: Review READMEs in the project (especially in /docs) before implementation

Verification Process

Analyze 3+ similar components before suggesting modifications
Document patterns (naming, organization, imports, types) before proceeding
Present findings for confirmation before implementing
Verify independently - never trust assumptions without evidence

Code Implementation Standards

Split Large Files: Break files >250 lines and functions >20 lines
TypeScript: Apply precise TypeScript types for all interfaces
Error Handling: Implement proper error handling and graceful degradation
Component Hierarchy: Follow established pattern (containers → layout → functional)

Architecture Compliance

Server Components: Use Next.js Server Components appropriately
State Management: Prefer React hooks over globals
API Structure: Structure API routes efficiently using ESM syntax
Database: Follow established Supabase patterns
Styling: Use Tailwind utility classes with mobile-first responsive design

Change Management

Small Scope: Work within defined scope - one file or closely related files only
Exact Paths: Present exact file paths and proposed changes for approval
Incremental Changes: Make small, targeted changes rather than large rewrites
Existing Files: Always prefer modifying existing files over creating new ones

SDK & Pattern Consistency

Use Existing Libraries: Leverage existing SDKs (Vercel AI SDK, authentication, UI libraries)
AI Patterns: Follow established Vercel AI SDK patterns for streaming, RAG, and tools
UI Components: Use shadcn/ui components following design system patterns
Style Matching: Match existing code styles perfectly (indentation, naming, imports)

Documentation Responsibilities

Always update or create READMEs in the /docs folder for implemented features
Document all steps performed for implementation
Update documentation when finding outdated information
Example documentation path: /Users/Humberto/Documents/GitHub/san-diego-version/docs

Remember to follow Next.js App Router patterns and AI SDK best practices. Always look for files and directories to exist before creating your own.