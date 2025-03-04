# User ID Implementation Improvements

## Overview

We've centralized and standardized the user ID implementation across the application to ensure consistency in analytics and logging. This improves the reliability of user tracking and simplifies the codebase by removing duplicate implementations.

## Key Changes

1. **Created a Centralized User ID Utility**
   - Implemented `getUserId()` function in `src/utils/user-id.ts`
   - Added a React hook `useUserId()` with proper hydration handling
   - Standardized the localStorage key as a constant

2. **Updated Components**
   - Modified `EnhancedChat` to use the centralized hook
   - Updated `DeepSearchButton` to use the centralized utility
   - Fixed `ChatInterface` to use the centralized hook
   - Removed duplicate user ID generation code

3. **Fixed Linter Errors**
   - Corrected the `sdkSetMessages` call in `ChatInterface`
   - Ensured proper dependency arrays in useEffect hooks
   - Fixed component ordering to prevent "used before declaration" errors

4. **Improved Hydration Handling**
   - Added proper useState/useEffect pattern in the useUserId hook
   - Ensured consistent behavior between server and client rendering
   - Prevented hydration mismatches by initializing state as undefined

## Benefits

1. **Consistency**: All components now use the same user ID, ensuring consistent analytics tracking.
2. **Maintainability**: Changes to user ID generation only need to be made in one place.
3. **Reliability**: Proper hydration handling prevents issues with server/client rendering.
4. **Type Safety**: Added TypeScript types for better developer experience.

## Implementation Details

### User ID Utility

```typescript
// src/utils/user-id.ts
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect } from 'react';

const USER_ID_KEY = 'chat_user_id';

export function getUserId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  
  let userId = localStorage.getItem(USER_ID_KEY);
  
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  
  return userId;
}

export function useUserId(): string | undefined {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserId(getUserId());
    }
  }, []);
  
  return userId;
}
```

### Component Usage

```typescript
// In React components
import { useUserId } from '@/utils/user-id';

function MyComponent() {
  const userId = useUserId();
  
  // Use userId for logging, analytics, etc.
}

// In non-React contexts
import { getUserId } from '@/utils/user-id';

function logEvent() {
  const userId = getUserId();
  
  // Use userId for logging, analytics, etc.
}
```

## Future Improvements

1. **User Authentication Integration**: Connect the anonymous user ID with authenticated user IDs when users log in.
2. **Cross-Device Tracking**: Consider implementing a solution for tracking users across devices.
3. **Privacy Controls**: Add mechanisms for users to opt out of tracking or reset their ID.
4. **Analytics Enhancement**: Extend the user ID utility to include additional user properties for richer analytics. 