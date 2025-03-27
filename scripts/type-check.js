#!/usr/bin/env node

import { execSync } from 'child_process';
import { watch } from 'fs';
import { join } from 'path';
import { setTimeout } from 'timers/promises';

// Configuration
const TS_FILES_GLOB = 'app/**/*.ts?(x)';
const DEBOUNCE_MS = 1000;
const COLOR_RED = '\x1b[31m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_RESET = '\x1b[0m';

// State
let debounceTimer;
let isChecking = false;

console.log(`${COLOR_YELLOW}Starting TypeScript type checking watcher...${COLOR_RESET}`);
console.log(`${COLOR_YELLOW}Watching TypeScript files for changes...${COLOR_RESET}`);

// Initial check
runTypeCheck();

// Watch for file changes in the app directory
watch(join(process.cwd(), 'app'), { recursive: true }, async (eventType, filename) => {
    if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) {
        return;
    }

    // Clear previous debounce timer
    clearTimeout(debounceTimer);

    // Debounce to avoid multiple runs when multiple files change at once
    debounceTimer = setTimeout(() => {
        if (!isChecking) {
            console.log(`${COLOR_YELLOW}File changed: ${filename} - Running type check...${COLOR_RESET}`);
            runTypeCheck();
        }
    }, DEBOUNCE_MS);
});

function runTypeCheck() {
    isChecking = true;

    try {
        console.log(`${COLOR_YELLOW}Running TypeScript type check...${COLOR_RESET}`);
        const startTime = Date.now();

        // Run TypeScript type check
        execSync('npx tsc --noEmit', { stdio: 'inherit' });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`${COLOR_GREEN}✓ TypeScript check passed (${duration}s)${COLOR_RESET}`);
    } catch (error) {
        console.log(`${COLOR_RED}✗ TypeScript check failed${COLOR_RESET}`);
        // Don't print the full error as it would duplicate the output from tsc
    } finally {
        isChecking = false;
    }
} 