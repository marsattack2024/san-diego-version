# ESM Migration Guide

This document provides a comprehensive guide on our migration from CommonJS to ECMAScript Modules (ESM) in our Next.js application, including the challenges we faced, solutions implemented, and best practices for maintaining and improving the ESM implementation.

## Table of Contents

- [Overview](#overview)
- [Migration Steps](#migration-steps)
- [Challenges and Solutions](#challenges-and-solutions)
- [Maintenance Guide](#maintenance-guide)
- [Future Improvements](#future-improvements)
- [Troubleshooting](#troubleshooting)
- [Resources](#resources)

## Overview

ECMAScript Modules (ESM) is the official standard format to package JavaScript code for reuse. Benefits include:

- **Static analysis**: Enables better tree-shaking and optimization
- **Asynchronous loading**: Better performance through parallel loading
- **Explicit imports/exports**: Clearer code organization
- **Future compatibility**: Aligns with the direction of JavaScript ecosystem

Our migration involved updating configuration files, fixing import paths, and ensuring compatibility across the codebase.

## Migration Steps

### 1. Update Configuration Files

#### package.json

Added the `type` field to indicate ESM usage:

```json
{
  "type": "module"
}
```

#### tsconfig.json

Updated TypeScript configuration for ESM compatibility:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "paths": {
      "@/*": ["./src/*", "./*"]
    }
  }
}
```

#### next.config.mjs

Renamed from `next.config.js` and updated to use ESM syntax:

```javascript
export default {
  experimental: {
    esmExternals: true
  }
}
```

### 2. Fix Import Paths

Created scripts to automatically fix import paths:

- `scripts/update-imports.js`: Adds file extensions to imports
- `scripts/esm-fix.js`: Updates TypeScript configuration and fixes import paths
- `scripts/fix-alias-imports.js`: Fixes alias imports to use correct paths

### 3. Mirror Critical Files

Created a mirror structure in the `src` directory for critical files:

- `src/lib/utils.ts`
- `src/components/ui/*`
- `src/config/agents.ts`
- `src/types/chat.ts`

This ensures compatibility with the path aliases configured in `tsconfig.json`.

## Challenges and Solutions

### Challenge 1: Module Resolution

**Problem**: TypeScript's `moduleResolution` settings caused conflicts with ESM imports.

**Solution**: Changed `moduleResolution` from "NodeNext" to "bundler" and updated `module` from "NodeNext" to "ESNext".

### Challenge 2: Path Aliases

**Problem**: Path aliases like `@/lib/utils` couldn't be resolved correctly.

**Solution**:
1. Updated `paths` in `tsconfig.json` to include both `./src/*` and `./*`
2. Mirrored critical files in the `src` directory
3. Created a script to fix alias imports

### Challenge 3: File Extensions

**Problem**: ESM requires explicit file extensions in import paths.

**Solution**: Created scripts to automatically add `.js` extensions to imports of TypeScript files (as they'll be compiled to JS).

## Maintenance Guide

### Adding New Files

When adding new files to the project:

1. Use ESM syntax for imports and exports:
   ```typescript
   // Use this
   import { something } from './module.js';
   export const newThing = {};
   
   // Not this
   const something = require('./module');
   module.exports = { newThing: {} };
   ```

2. For TypeScript files that will be imported elsewhere:
   - When importing TypeScript files, use `.js` extension in the import path (not `.ts` or `.tsx`)
   - Example: `import { Button } from './Button.js';` (even though the actual file is `Button.tsx`)

3. For path aliases:
   - Ensure the file exists in the correct location (either root or `src` directory)
   - Use consistent path alias patterns: `@/components/ui/button`

### Running Migration Scripts

If you encounter import-related issues, you can run our migration scripts:

```bash
# Fix all imports in the codebase
npm run esm-fix

# Fix specific alias imports
npm run fix-alias-imports
```

### Checking for ESM Compatibility

To verify a file is ESM compatible:

1. It should use `import`/`export` syntax instead of `require`/`module.exports`
2. It should not rely on CommonJS-specific globals like `__dirname` or `__filename` without proper ESM alternatives
3. It should use proper file extensions in import paths

## Future Improvements

### 1. Consolidate Directory Structure

Currently, we have files in both the root directory and the `src` directory. To improve maintainability:

- Move all code to either the root or `src` directory
- Update imports and path aliases accordingly
- Update build scripts to reflect the new structure

### 2. Automated Testing for ESM Compatibility

Implement automated tests to ensure ESM compatibility:

- Add ESLint rules for ESM best practices
- Create CI checks for proper import/export syntax
- Test dynamic imports and top-level await usage

### 3. Performance Optimization

Leverage ESM features for better performance:

- Implement code splitting using dynamic imports
- Use top-level await for cleaner async initialization
- Optimize tree-shaking by using named exports

### 4. Documentation and Training

- Create component documentation that includes proper import examples
- Train team members on ESM best practices
- Document patterns for handling third-party libraries that may not be ESM compatible

## Troubleshooting

### Common Errors and Solutions

#### "Cannot find module" or "Module not found"

**Problem**: Import path cannot be resolved.

**Solutions**:
1. Check if the file exists at the specified path
2. Ensure you're using the correct file extension (`.js` for TypeScript files)
3. For path aliases, check if the file exists in both root and `src` directories
4. Run `npm run fix-alias-imports` to fix alias imports

#### "SyntaxError: Cannot use import statement outside a module"

**Problem**: Trying to use ESM syntax in a CommonJS context.

**Solutions**:
1. Ensure `"type": "module"` is in your package.json
2. Check if the file has a `.mjs` extension or is in an ESM context
3. Convert any remaining CommonJS syntax to ESM

#### "ERR_MODULE_NOT_FOUND" with correct path

**Problem**: Node.js cannot resolve the module, often due to extension issues.

**Solutions**:
1. Add file extensions to import paths
2. Run `npm run update-imports` to fix extensions
3. Check if the module is published as ESM

## Resources

### Official Documentation

- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [TypeScript ESM Support](https://www.typescriptlang.org/docs/handbook/esm-node.html)
- [Next.js ESM Support](https://nextjs.org/docs/app/building-your-application/optimizing/module-path-aliases)

### Helpful Articles

- [JavaScript Modules: A Beginner's Guide](https://www.freecodecamp.org/news/javascript-modules-a-beginner-s-guide-783f7d7a5fcc/)
- [Understanding ES Modules in Node.js](https://blog.logrocket.com/es-modules-in-node-js-12-from-experimental-to-release/)
- [Migrating from CommonJS to ESM](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)

### Tools

- [es-module-lexer](https://github.com/guybedford/es-module-lexer) - Lexer for analyzing ESM imports/exports
- [cjs-to-es6](https://github.com/nolanlawson/cjs-to-es6) - Tool for converting CommonJS to ES6 modules
- [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import) - ESLint plugin for linting import statements

---

This guide is a living document. As we continue to improve our ESM implementation, we'll update this guide with new best practices and solutions. 