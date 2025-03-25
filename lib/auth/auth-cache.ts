/**
 * In-memory authentication cache to reduce redundant auth checks
 */

'use client';

import { LRUCache } from 'lru-cache';
import { User } from '@supabase/supabase-js';

// Calculate TTL based on environment - longer for development
const isDevelopment = process.env.NODE_ENV === 'development';

// Options for the user cache
const USER_CACHE_OPTIONS = {
  max: 50, // Maximum number of users to cache
  ttl: isDevelopment 
    ? 1000 * 60 * 30  // 30 minutes in development (increased from 15 minutes)
    : 1000 * 60 * 15,  // 15 minutes in production (increased from 5 minutes)
};

// Cache for user objects
const userCache = new LRUCache(USER_CACHE_OPTIONS);

// Cache for session validation results
const sessionValidCache = new LRUCache({
  max: 100, // Cache more session validations
  ttl: isDevelopment
    ? 1000 * 60 * 15  // 15 minutes for development (increased from 10 minutes)
    : 1000 * 60 * 5,  // 5 minutes for production (increased from 30 seconds)
});

// User cache settings
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes
let cachedUser: User | null = null;
let cacheTimestamp = 0;

/**
 * Simple auth cache to reduce the number of Supabase auth calls
 * during page navigation and component mounts
 */
export const authCache = {
  /**
   * Get a user from cache if available and not expired
   * @param ttlMs Cache TTL in milliseconds
   */
  get(ttlMs: number = DEFAULT_TTL): User | null {
    if (!cachedUser) return null;
    
    const age = Date.now() - cacheTimestamp;
    if (age > ttlMs) {
      return null;
    }
    
    return cachedUser;
  },
  
  /**
   * Store a user in the cache
   * @param user User object to cache
   */
  set(user: User | null): void {
    cachedUser = user;
    cacheTimestamp = Date.now();
  },
  
  /**
   * Clear the auth cache
   */
  clear(): void {
    cachedUser = null;
    cacheTimestamp = 0;
  },

  /**
   * Check if cached user is still valid (within TTL)
   */
  isValid(userId: string): boolean {
    return userCache.has(userId);
  },
  
  /**
   * Store user in cache
   */
  setUser(user: any): void {
    if (user?.id) {
      userCache.set(user.id, user);
    }
  },
  
  /**
   * Get cached user if valid, otherwise null
   */
  getUser(ttlMs?: number): any {
    // This function kept for backward compatibility
    // Ideally you should use getById instead
    const userId = userCache.keys().next().value;
    return userId ? userCache.get(userId) : null;
  },

  /**
   * Get user by ID
   */
  getUserById(userId: string): any {
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
  clearAll(): void {
    userCache.clear();
    sessionValidCache.clear();
  }
}; 