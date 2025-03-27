# TypeScript Guide for Next.js 15

This document outlines the TypeScript setup and best practices for our Next.js 15 application.

## Local Type Checking

To check types locally without deploying to Vercel:

```bash
# Basic type check (detects errors but doesn't emit files)
npx tsc --noEmit

# Watch mode for continuous type checking during development
npx tsc --noEmit --watch
```

## Next.js 15 Type Patterns

### API Route Handlers

For Next.js 15 route handlers, use the following pattern:

```typescript
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  // Access parameters directly, no need to await
  const slug = params.slug;
  
  // Your code here
  
  return new Response(/* your response */);
}
```

Key points:
- Params are passed as objects, not Promises
- Explicitly type the return as `Promise<Response>`
- Always destructure params properly: `{ params }: { params: { paramName: string } }`

### Page Components with Dynamic Parameters

For page components with dynamic parameters:

```typescript
export default async function Page({ 
  params 
}: { 
  params: { slug: string } 
}) {
  // Your code here
}
```

## Cookie Handling in Next.js 15

In Next.js 15, the `cookies()` function is asynchronous and must be awaited:

```typescript
// Correct in Next.js 15
const cookieStore = await cookies();

// Incorrect - will cause TypeScript errors
const cookieStore = cookies();
```

## Missing Components and Features

When you encounter imports for components or features that have been removed:

1. **Create local stubs**: Instead of removing files that depend on missing components, create minimal stub implementations:

```typescript
// Original import (missing component)
// import LongText from '@/components/long-text';

// Local stub implementation
const LongText = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return (
    <div className={className}>
      {children}
    </div>
  );
};
```

2. **Comment out feature usage**: If a feature is no longer needed, comment it out rather than deleting entire files.

## Error Handling in Loggers

Always type errors properly in logger calls:

```typescript
// Incorrect
logger.error('Error occurred', { error });

// Correct
logger.error('Error occurred', { 
  error: error instanceof Error ? error.message : String(error)
});
```

## Pre-commit Hooks

We use Husky and lint-staged to check TypeScript before commits:

- All TypeScript files are checked with `tsc --noEmit`
- Staged files are linted with ESLint

## VS Code Configuration

Our VS Code workspace is configured for optimal TypeScript experience:

- Uses the project's TypeScript version
- Enables automatic imports with non-relative paths
- Auto-formats on save
- Runs ESLint fix on save

## Common Issues and Solutions

1. **Route Handler Parameter Issues**: Ensure you're using the correct destructuring pattern and return type.

2. **Missing Return Types**: Always specify return types for functions, especially in API routes.

3. **Type Imports**: Use explicit type imports with `import type { X } from 'y'` for better tree-shaking.

4. **Missing Dependencies**: If you see errors about missing modules, install the required types or create local stubs.

## Pre-build Safety

The project includes a prebuild script that runs TypeScript checking automatically:

```bash
npm run build  # This automatically runs tsc --noEmit first
```

## Resources

- [Next.js 15 TypeScript Documentation](https://nextjs.org/docs/app/building-your-application/configuring/typescript)
- [TypeScript Official Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) 