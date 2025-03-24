/**
 * In-memory authentication cache to reduce redundant auth checks
 */

// Use a more robust LRU cache
import { LRUCache } from 'lru-cache';

// Calculate TTL based on environment - longer for development
const isDevelopment = process.env.NODE_ENV === 'development';

// Options for the user cache
const USER_CACHE_OPTIONS = {
  max: 50, // Maximum number of users to cache
  ttl: isDevelopment 
    ? 1000 * 60 * 15  // 15 minutes in development
    : 1000 * 60 * 5,  // 5 minutes in production
};

// Cache for user objects
const userCache = new LRUCache(USER_CACHE_OPTIONS);

// Cache for session validation results
const sessionValidCache = new LRUCache({
  max: 100, // Cache more session validations
  ttl: isDevelopment
    ? 1000 * 60 * 10  // 10 minutes for development 
    : 1000 * 30,      // 30 seconds for production
});

export const authCache = {
  /**
   * Check if cached user is still valid (within TTL)
   */
  isValid(userId: string): boolean {
    return userCache.has(userId);
  },
  
  /**
   * Store user in cache
   */
  set(user: any): void {
    if (user?.id) {
      userCache.set(user.id, user);
    }
  },
  
  /**
   * Get cached user if valid, otherwise null
   */
  get(ttlMs?: number): any {
    // This function kept for backward compatibility
    // Ideally you should use getById instead
    const userId = userCache.keys().next().value;
    return userId ? userCache.get(userId) : null;
  },

  /**
   * Get user by ID
   */
  getById(userId: string): any {
    return userCache.get(userId);
  },

  /**
   * Check if a session is valid (without full auth check)
   */
  isSessionValid(sessionId: string): boolean {
    return sessionValidCache.has(sessionId);
  },

  /**
   * Mark a session as valid
   */
  markSessionValid(sessionId: string): void {
    sessionValidCache.set(sessionId, true);
  },
  
  /**
   * Clear the cache for a specific user
   */
  clearUser(userId: string): void {
    userCache.delete(userId);
  },

  /**
   * Clear all caches
   */
  clear(): void {
    userCache.clear();
    sessionValidCache.clear();
  }
}; 