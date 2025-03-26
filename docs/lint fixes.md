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

2. ✅ `/app/api/chat/[id]/route.ts` - Multiple unused imports/variables
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
   Fixed by removing unused imports and renaming request parameters to `_request`

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
   - Changing `let` to `const` for systemPrompt

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
   Fixed by removing unused imports, circuit breaker variables, and formatError function

2. ✅ `/app/api/chat/session/route.ts` - Unused variables
   ```
   5:10  error  'cookies' is defined but never used
   6:15  error  'User' is defined but never used
   179:37  error  'request' is defined but never used
   ```
   Fixed by removing unused imports and renaming request parameter to `_request`

3. ✅ `/app/chat/layout.tsx` - React undefined and unused variable
   ```
   9:13  error  'React' is not defined
   17:11  error  'headersList' is assigned a value but never used
   ```
   Fixed by adding React import and removing unused headersList variable

4. ✅ `/app/layout.tsx` - React undefined
   ```
   44:13  error  'React' is not defined  no-undef
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

10. ❌ `/app/api/debug/histories/route.ts` - Import order and unused variables
    ```
    5:37  error  'request' is defined but never used
    28:1  error  Import in body of module; reorder to top
    28:10  error  'cookies' is defined but never used
    103:36  error  'sessionsError' is assigned a value but never used
    ```

11. ❌ `/app/api/example.ts` - Missing extension
    ```
    2:29  error  Missing file extension for "@/lib/logger/api-logger"
    ```

12. ❌ `/app/api/profile/notification/route.ts` - Unused variable
    ```
    39:11  error  'supabase' is assigned a value but never used
    ```

13. ❌ `/app/api/vote/route.ts` - Unused variable
    ```
    1:10  error  'NextRequest' is defined but never used
    ```

14. ❌ `/app/chat/[id]/chat-client.tsx` - Unused variable
    ```
    15:50  error  'createConversation' is assigned a value but never used
    ```

15. ❌ `/app/chat/[id]/page.tsx` - Unused imports
    ```
    3:10  error  'Chat' is defined but never used
    5:10  error  'useEffect' is defined but never used
    ```

16. ❌ `/app/chat/actions.ts` - Unused variable
    ```
    8:3  error  'messageId' is defined but never used
    ```

17. ❌ `/app/chat/page.tsx` - Unused variable
    ```
    61:15  error  'newId' is assigned a value but never used
    ```

18. ❌ `/app/unauthorized/page.tsx` - Unescaped entities
    ```
    13:20  error  `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`  react/no-unescaped-entities
    ```

## Strategy for Fixing

1. **Unused Variables/Imports**:
   - Prefix route handler parameters with underscore (e.g., `_request`)
   - Remove unused imports
   - Remove unused variable declarations

2. **Undefined Variables**:
   - Add React import for JSX files
   - Define proper types for missing interfaces

3. **Import Issues**:
   - Add file extensions to imports (`.js`, `.ts`)
   - Move imports to the top of the file
   - Remove duplicate imports

4. **Code Style Issues**:
   - Convert `let` to `const` when variables are not reassigned
   - Move function declarations to the top level
   - Refactor Promise executors to not use async

## Progress Summary

- Total Files with Errors: 21
- Total Errors: ~94
  - Unused Variables/Imports: 68
  - Undefined Variables: 5
  - Import Extension Issues: 7
  - Prefer Const Issues: 5
  - Import Order Issues: 3
  - Async Promise Issues: 0 (All fixed)
  - Function Declaration Issues: 2
  - Unescaped Entities: 1
  - Other Issues: 3
- Fixed: 17
- In Progress: 0
- Remaining: 77

Last Updated: August 25, 2023
