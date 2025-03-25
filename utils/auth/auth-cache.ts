/**
 * In-memory authentication cache to reduce redundant auth checks
 * Simplified implementation using only LRU cache
 */

import { LRUCache } from 'lru-cache';
import { User } from '@supabase/supabase-js';

// Calculate TTL based on environment - longer for development
const isDevelopment = process.env.NODE_ENV === 'development';

// Options for the user cache
const USER_CACHE_OPTIONS = {
  max: 50, // Maximum number of users to cache
  ttl: isDevelopment 
    ? 1000 * 60 * 30  // 30 minutes in development
    : 1000 * 60 * 15,  // 15 minutes in production
};

// Cache for user objects
const userCache = new LRUCache<string, User>(USER_CACHE_OPTIONS);

// Cache for session validation results
const sessionValidCache = new LRUCache<string, boolean>({
  max: 100, // Cache more session validations
  ttl: isDevelopment
    ? 1000 * 60 * 15  // 15 minutes for development
    : 1000 * 60 * 5,  // 5 minutes for production
});

// Define constants for version tracking and debugging
const CACHE_VERSION = '1.0.0'; // Change when cache structure changes

/**
 * Simple auth cache to reduce the number of Supabase auth calls
 * during page navigation and component mounts
 */
export const authCache = {
  /**
   * Get a user from cache by ID
   * @param userId User ID to look up
   */
  get(userId: string): User | null {
    try {
      return userCache.get(userId) || null;
    } catch (error) {
      console.error('Error retrieving user from cache:', error);
      return null;
    }
  },
  
  /**
   * Store a user in the cache
   * @param user User object to cache
   */
  set(user: User | null): void {
    if (!user?.id) return;
    
    try {
      userCache.set(user.id, user);
    } catch (error) {
      console.error('Error setting user in cache:', error);
    }
  },
  
  /**
   * Check if cached user is still valid (within TTL)
   */
  isValid(userId: string): boolean {
    return userCache.has(userId);
  },
  
  /**
   * Get cached user if valid, otherwise null
   * This function is kept for backward compatibility
   * Ideally you should use getById instead
   */
  getUser(): User | null {
    try {
      const firstKey = Array.from(userCache.keys())[0];
      return firstKey ? userCache.get(firstKey) || null : null;
    } catch (error) {
      console.error('Error getting first user from cache:', error);
      return null;
    }
  },

  /**
   * Get user by ID - preferred method for retrieving users
   */
  getUserById(userId: string): User | null {
    try {
      return userCache.get(userId) || null;
    } catch (error) {
      console.error('Error getting user by ID from cache:', error);
      return null;
    }
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
    try {
      sessionValidCache.set(sessionId, true);
    } catch (error) {
      console.error('Error marking session valid in cache:', error);
    }
  },
  
  /**
   * Clear the cache for a specific user
   */
  clearUser(userId: string): void {
    try {
      userCache.delete(userId);
    } catch (error) {
      console.error('Error clearing user from cache:', error);
    }
  },

  /**
   * Clear all caches
   */
  clearAll(): void {
    try {
      userCache.clear();
      sessionValidCache.clear();
    } catch (error) {
      console.error('Error clearing all caches:', error);
    }
  },
  
  /**
   * Get cache statistics for monitoring
   */
  getStats(): { userCacheSize: number, sessionCacheSize: number, version: string } {
    return {
      userCacheSize: userCache.size,
      sessionCacheSize: sessionValidCache.size,
      version: CACHE_VERSION
    };
  },
  
  /**
   * Invalidate cache entries after profile updates
   */
  invalidateUserData(userId: string): void {
    try {
      // Remove the user from cache to force a refresh
      userCache.delete(userId);
      
      // If there are any session IDs associated with this user,
      // we would clear those too, but we don't track that association currently
    } catch (error) {
      console.error('Error invalidating user data in cache:', error);
    }
  }
}; 