# Lint Error Fixes Tracking

This document tracks lint errors in the San Diego project and our progress fixing them.

## Error Categories

- **Unused Variables/Imports** - Variables or imports defined but never used
- **Undefined Variables** - Variables used but not defined
- **Import Issues** - Issues with import statements
- **Async/Promise Issues** - Incorrect use of async/Promise
- **Code Style Issues** - Const vs let, declaration positioning, etc.

## Priority Levels

- **High** - Errors in critical application code that could cause bugs
- **Medium** - Errors in important but non-critical code
- **Low** - Minor style issues or errors in rarely used code

## Progress Tracking

- ✅ Fixed
- 🔄 In Progress
- ❌ Not Started

## Error List

### High Priority

1. ✅ `/app/api/auth/status/route.ts` - Unused parameter
   ```
   12:27  error  'request' is defined but never used  no-unused-vars
   ```
   Fixed by renaming parameter to `_request`

2. ❌ `/app/api/chat/[id]/route.ts` - Multiple unused imports/variables
   ```
   4:32  error  'createSupabaseServerClient' is defined but never used  no-unused-vars
   5:10  error  'cookies' is defined but never used
   5:19  error  'headers' is defined but never used
   6:29  error  'PostgrestError' is defined but never used
   6:70  error  'User' is defined but never used
   7:10  error  'authCache' is defined but never used
   13:37  error  'request' is defined but never used
   61:9   error  'startTime' is assigned a value but never used
   713:21  error  'insertData' is assigned a value but never used
   ```

3. ✅ `/app/api/chat/route.ts` - Serious code issues
   ```
   63:29  error  'NodeJS' is not defined
   75:52  error  Promise executor functions should not be async
   75:68  error  'reject' is defined but never used
   831:11  error  Move function declaration to function body root
   ```
   Fixed by:
   - Creating a custom `TimeoutId` type using `ReturnType<typeof setTimeout>` to replace NodeJS.Timeout
   - Moving async functions outside of Promise constructors to fix the Promise executor issue
   - Moving the nested function declarations to the appropriate scope
   - Cleaning up duplicate imports

4. ✅ `/app/api/events/route.ts` - Undefined variable
   ```
   8:25  error  'ReadableStreamController' is not defined  no-undef
   ```
   Fixed by adding a type definition for ReadableStreamController and fixed error handling in catch blocks

5. ✅ `/app/api/middleware.ts` - Unused variables
   ```
   147:13  error  'skipDetailedLogging' is assigned a value but never used
   174:61  error  'req' is defined but never used
   ```
   Fixed by removing the unused skipDetailedLogging variable and renaming the req parameter to _req

### Medium Priority

1. ✅ `/app/api/history/route.ts` - Multiple unused variables
   ```
   3:10  error  'Chat' is defined but never used
   4:10  error  'User' is defined but never used
   13:5  error  'consecutiveErrors' is assigned a value but never used
   14:5  error  'lastErrorTime' is assigned a value but never used
   15:7  error  'ERROR_THRESHOLD' is assigned a value but never used
   16:7  error  'ERROR_TIMEOUT' is assigned a value but never used
   18:10  error  'formatError' is defined but never used
   ```
   Fixed by removing unused imports and circuit breaker pattern variables that weren't being used

2. ❌ `/app/api/debug/histories/route.ts` - Import order and unused variables
   ```
   5:37  error  'request' is defined but never used
   28:1  error  Import in body of module; reorder to top
   28:10  error  'cookies' is defined but never used
   103:36  error  'sessionsError' is assigned a value but never used
   ```

3. ✅ `/app/(auth)/layout.tsx` - React undefined and unused import
   ```
   1:10  error  'AuthButton' is defined but never used
   9:13  error  'React' is not defined
   ```
   Fixed by removing the unused AuthButton import and adding React import

4. ✅ `/app/admin/layout.tsx` - React undefined
   ```
   12:63  error  'React' is not defined  no-undef
   ```
   Fixed by adding React import

5. ✅ `/app/api/auth/layout.tsx` - React undefined
   ```
   4:13  error  'React' is not defined  no-undef
   ```
   Fixed by adding React import

### Low Priority

1. ✅ `/app/admin/page.tsx` - Unused variable
   ```
   11:9  error  'isMobile' is assigned a value but never used
   ```
   Fixed by removing the unused import and variable

2. ✅ `/app/admin/users/page.tsx` - Unused variable
   ```
   66:10  error  'isDeleting' is assigned a value but never used
   ```
   Fixed by removing the unused isDeleting state variable and its associated setter calls

3. ✅ `/app/api/admin/dashboard/route.ts` - Unused variable
   ```
   58:27  error  'request' is defined but never used
   ```
   Fixed by renaming parameter to `_request`

4. ❌ `/app/api/admin/users/[userId]/route.ts` - Unused variable
   ```
   181:11  error  'tablesWithoutCascade' is assigned a value but never used
   ```

5. ❌ `/app/api/admin/users/route.ts` - Unused variables
   ```
   82:27  error  'request' is defined but never used
   132:19  error  'tables' is assigned a value but never used
   ```

6. ✅ `/app/api/client-error.ts` - Missing extension and unused variable
   ```
   3:29  error  Missing file extension for "@/lib/logger/api-logger"
   11:28  error  'level' is assigned a value but never used
   ```
   Fixed by updating import to use `withRequestTracking` from `@/lib/logger/edge-logger` and removing unused level variable

7. ❌ `/app/api/debug/cache-inspector/route.ts` - Unused import
   ```
   2:10  error  'redisClientPromise' is defined but never used
   ```

8. ❌ `/app/api/debug/cache-repair/route.ts` - Unused import
   ```
   3:10  error  'redisCache' is defined but never used
   ```

9. ❌ `/app/api/debug/cache-test/route.ts` - Unused variables
   ```
   2:10  error  'redisCache' is defined but never used
   11:27  error  'request' is defined but never used
   ```

10. ❌ `/app/api/example.ts` - Missing extension
    ```
    2:29  error  Missing file extension for "@/lib/logger/api-logger"
    ```

11. ❌ `/app/api/profile/notification/route.ts` - Unused variable
    ```
    39:11  error  'supabase' is assigned a value but never used
    ```

## Strategy for Fixing

1. **Unused Variables/Imports (294 errors)**:
   - **Automated Fix**: Create a script to automatically prefix route handler parameters with underscore (e.g., `_request`)
   - **Manual Fix for Critical Files**: Manually review and fix unused variables in critical files (chat, auth)
   - **Bulk Fix**: For non-critical files, use eslint's `--fix` option where possible
   - **Disable Rule Where Appropriate**: Add `/* eslint-disable no-unused-vars */` for temporary development code

2. **Undefined Variables (20 errors)**:
   - Add React import for JSX files: `import React from 'react'`
   - Import other missing dependencies
   - Define types for globally used interfaces

3. **Import Issues (18 errors)**:
   - Add file extensions to imports (`.js`, `.ts`)
   - Move imports to the top of the file
   - Create a script to automatically add extensions to imports

4. **Code Style Issues (6 errors)**:
   - Convert `let` to `const` when variables are not reassigned
   - Move function declarations to the top level when possible
   - Refactor Promise executors to not use async

5. **Phase Approach**:
   - **Phase 1**: Fix high-impact errors in critical paths (auth, chat, API endpoints)
   - **Phase 2**: Fix React-related errors (undefined React, JSX issues)
   - **Phase 3**: Fix import-related errors
   - **Phase 4**: Fix remaining unused variables with automated scripts
   - **Phase 5**: Fix code style issues

6. **Prioritization**:
   - Focus on errors most likely to cause runtime bugs first
   - Address files with the most usage next
   - Leave rarely used utilities for last

## Progress Summary

- Total Files with Errors: 114
- Total Errors: ~350
  - Unused Variables/Imports: 294
  - Undefined Variables: 20
  - Import Extension Issues: 14
  - Prefer Const Issues: 5
  - Import Order Issues: 4
  - Async Promise Issues: 0 (All fixed)
  - Other Issues: ~12
- Fixed: 12
- In Progress: 0
- Remaining: ~338

Last Updated: August 25, 2023
