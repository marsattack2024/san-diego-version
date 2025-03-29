# Scripts Documentation

This document describes the operational scripts used in the San Diego project, their purpose, and how to use them.

## Directory Structure

```
scripts/
├── lib/            # Shared utilities for scripts
│   └── env-loader.ts  # Environment variable loading and validation
├── make-admin.js      # Create or update admin users
├── type-check.js      # Run TypeScript type checking
├── check-env.ts       # Validate environment variables
├── update-imports.js  # Update import paths in project files
├── deploy-vercel.js   # Deploy to Vercel
├── dev.js             # Run development server
├── setup-env.ts       # Set up environment variables
└── setup-supabase.js  # Initialize Supabase resources
```

## Core Scripts

### Development Scripts

#### `dev.js`
- **Purpose**: Run the development server with proper environment setup
- **Usage**: `node scripts/dev.js`
- **Description**: Sets up environment variables and starts the Next.js development server

#### `type-check.js`
- **Purpose**: Run TypeScript type checking without compiling
- **Usage**: `node scripts/type-check.js`
- **Description**: Validates TypeScript types across the codebase

### Deployment Scripts

#### `deploy-vercel.js`
- **Purpose**: Deploy the application to Vercel
- **Usage**: `node scripts/deploy-vercel.js [environment]`
- **Arguments**:
  - `environment`: (Optional) Target environment (production, preview, development)
- **Description**: Handles pre-deployment tasks and triggers Vercel deployment

### Setup Scripts

#### `setup-env.ts`
- **Purpose**: Set up environment variables for local development
- **Usage**: `tsx scripts/setup-env.ts`
- **Description**: Interactively guides you through setting up required environment variables

#### `setup-supabase.js`
- **Purpose**: Initialize Supabase resources (tables, functions, policies)
- **Usage**: `node scripts/setup-supabase.js`
- **Description**: Sets up necessary Supabase resources for the application

#### `check-env.ts`
- **Purpose**: Validate that all required environment variables are set
- **Usage**: `tsx scripts/check-env.ts`
- **Description**: Checks for presence and validity of critical environment variables

### Utility Scripts

#### `make-admin.js`
- **Purpose**: Create or update admin users in Supabase
- **Usage**: `node scripts/make-admin.js [email]`
- **Arguments**:
  - `email`: Email address of the user to promote to admin
- **Description**: Sets admin role for specified user or lists current admins

#### `update-imports.js`
- **Purpose**: Update import paths across the codebase
- **Usage**: `node scripts/update-imports.js`
- **Description**: Updates import paths to match current project structure

## Shared Utilities

The `scripts/lib/` directory contains shared utilities used by multiple scripts:

### `env-loader.ts`
- **Purpose**: Load and validate environment variables
- **Usage**: `import { env, loadEnvironment } from '../lib/env-loader';`
- **Description**: Provides standardized environment variable loading with validation, type conversion, and runtime detection

## Adding New Scripts

When adding new scripts, follow these guidelines:

1. **Naming**: Use clear, descriptive names (e.g., `setup-database.js` rather than `db.js`)
2. **Structure**: Follow existing patterns for argument handling and error reporting
3. **Shared Code**: Place reusable utilities in `scripts/lib/`
4. **Documentation**: Update this document when adding or modifying scripts

## Best Practices

1. **Error Handling**: Include proper error handling and exit codes
2. **Logging**: Use clear, structured console outputs with visual separators
3. **Confirmation**: For destructive operations, add confirmation prompts
4. **Idempotency**: Design scripts to be safely runnable multiple times
5. **Environment Detection**: Check for appropriate environment (dev/prod)

## Running Scripts

Most scripts can be run directly with Node.js:

```bash
node scripts/script-name.js [arguments]
```

For TypeScript scripts, use `tsx`:

```bash
npx tsx scripts/script-name.ts [arguments]
```

Many scripts are also available as npm scripts in `package.json`:

```bash
npm run dev       # Runs scripts/dev.js
npm run type-check # Runs scripts/type-check.js
```

## Common Issues

- **Permission Errors**: Ensure you have appropriate permissions for operations
- **Missing Dependencies**: Run `npm install` if you encounter module not found errors
- **Environment Variables**: Make sure your `.env` file is properly configured 