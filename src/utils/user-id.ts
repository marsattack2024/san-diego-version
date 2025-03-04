import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect } from 'react';

const USER_ID_KEY = 'chat_user_id';

/**
 * Get the current user ID from localStorage or generate a new one
 * This provides a consistent way to identify users across sessions
 * for analytics and logging purposes.
 */
export function getUserId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined; // Return undefined in server-side context
  }
  
  let userId = localStorage.getItem(USER_ID_KEY);
  
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  
  return userId;
}

/**
 * React hook to get the current user ID with proper hydration handling
 * This ensures the ID is consistent between server and client rendering
 */
export function useUserId(): string | undefined {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  
  useEffect(() => {
    // Only run in the browser
    if (typeof window !== 'undefined') {
      setUserId(getUserId());
    }
  }, []);
  
  return userId;
} 