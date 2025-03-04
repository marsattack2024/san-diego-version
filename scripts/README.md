# Scripts Directory

This directory contains utility scripts for the AI Chat Interface project.

## ESM Migration Scripts

- `fix-alias-imports.js` - Fixes alias imports in the codebase
- `esm-fix.js` - Fixes ESM-related issues in the codebase
- `update-imports.js` - Updates import statements to be ESM-compatible
- `esm-migration.js` - Main script for ESM migration
- `dev.js` - Development script
- `fix-all-imports.js` - Comprehensive script to fix all import issues

## Test Scripts

### Web Scraper Test (`test-scraper.js`)

A script to test the web scraping functionality. It scrapes content from specified URLs and extracts:
- Page title
- Meta description
- Main content

**Usage:**
```bash
node scripts/test-scraper.js
```

The script will test scraping on example.com and developer.mozilla.org by default.

### Perplexity API Test (`test-perplexity.js`)

A script to test the Perplexity API integration. It demonstrates:
- Regular (non-streaming) API calls
- Streaming API calls

**Requirements:**
- Perplexity API key in `.env` or `.env.local` file (PERPLEXITY_API_KEY)

**Usage:**
```bash
node scripts/test-perplexity.js
```

The script will run both regular and streaming tests with a sample query.

## Running the Scripts

All scripts are designed to be run with Node.js using ESM syntax. Make sure you have the required dependencies installed:

```bash
npm install
```

Then run any script using:

```bash
node scripts/script-name.js
```

## Adding New Scripts

When adding new scripts to this directory:

1. Use ESM syntax (import/export)
2. Add appropriate error handling
3. Document the script in this README
4. Include usage examples 