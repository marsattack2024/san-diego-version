/**
 * IMPORTANT: This file has been updated to fix authentication middleware issues
 * with history API requests, including:
 * 1. Enhanced circuit breaker to detect unauthorized request bursts
 * 2. New status code 409 support for auth-in-progress state
 * 3. Special handling for requests without timestamps
 * 4. Global request throttling to reduce API load
 */

import { createClient } from '@/utils/supabase/client';
import { clientCache } from '@/lib/cache/client-cache';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Chat } from '@/lib/db/schema';
import { Message } from 'ai';
import { generateUUID } from '@/lib/utils/uuid';

// Keep track of pending requests to deduplicate
const pendingRequests: Record<string, Promise<Chat[]> | null> = {};

// Global request throttling
let lastHistoryRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds minimum between ANY history requests

// Track last refresh time
const lastRefreshTime = 0;
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes (increased from previous value)
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache TTL
const CACHE_TTL_ERROR = 10 * 60 * 1000; // 10 minutes cache TTL for error state

// Add cache and request optimization
const MIN_REFRESH_INTERVAL = 30 * 1000; // 30 seconds minimum between refreshes

// Rate limit tracking
let lastSuccessfulFetch = 0;
let consecutiveSuccessfulFetches = 0;
let adaptiveRefreshInterval = REFRESH_INTERVAL;

// Auth failure tracking constants
const AUTH_FAILURE_KEY = 'global_auth_failure';
const AUTH_FAILURE_COUNT_KEY = 'auth_failure_count';
const AUTH_FAILURE_LAST_TIME_KEY = 'auth_failure_last_time';
const AUTH_BACKOFF_DURATION_KEY = 'auth_backoff_duration';

// Exponential backoff settings
const MIN_AUTH_COOLDOWN = 2 * 60 * 1000; // 2 min initial backoff
const MAX_AUTH_COOLDOWN = 30 * 60 * 1000; // 30 min max backoff
const BACKOFF_FACTOR = 2; // Double the backoff each time
const MAX_FAILURE_COUNT = 5; // Reset after 5 failures

// In-memory state (will be initialized from localStorage)
let isInAuthFailureCooldown = false;
let authFailureCount = 0;
let authBackoffDuration = MIN_AUTH_COOLDOWN;
let authFailureTimer: ReturnType<typeof setTimeout> | null = null;

// Track unauthorized requests to apply immediate circuit breaking
let recentUnauthorizedRequests: number[] = [];
const UNAUTHORIZED_THRESHOLD = 3; // Activate circuit breaker after 3 unauthorized responses in 5 seconds
const UNAUTHORIZED_WINDOW = 5000; // 5 second window for tracking unauthorized responses

/**
 * Calculate exponential backoff duration
 * @param failureCount Number of consecutive failures
 * @returns Backoff duration in milliseconds
 */
function calculateBackoffDuration(failureCount: number): number {
  // Cap the failure count for calculation
  const cappedCount = Math.min(failureCount, MAX_FAILURE_COUNT);
  // Calculate exponential backoff: MIN_BACKOFF * (FACTOR ^ (count-1))
  const backoff = MIN_AUTH_COOLDOWN * Math.pow(BACKOFF_FACTOR, cappedCount - 1);
  // Cap at the maximum backoff
  return Math.min(backoff, MAX_AUTH_COOLDOWN);
}

/**
 * Set the global auth failure state with exponential backoff
 * @param failed Whether authentication has failed
 */
function setAuthFailureState(failed: boolean) {
  try {
    // Clear any existing timer
    if (authFailureTimer) {
      clearTimeout(authFailureTimer);
      authFailureTimer = null;
    }

    if (failed) {
      // Retrieve current failure count from persistent storage
      const storedCount = clientCache.get(AUTH_FAILURE_COUNT_KEY, Infinity, true) || 0;

      // Increment failure count
      authFailureCount = storedCount + 1;

      // Calculate new backoff duration based on consecutive failures
      authBackoffDuration = calculateBackoffDuration(authFailureCount);

      // Store updated values in persistent storage
      clientCache.set(AUTH_FAILURE_COUNT_KEY, authFailureCount, Infinity, true);
      clientCache.set(AUTH_FAILURE_LAST_TIME_KEY, Date.now(), Infinity, true);
      clientCache.set(AUTH_BACKOFF_DURATION_KEY, authBackoffDuration, Infinity, true);

      // Set the auth failure flag
      isInAuthFailureCooldown = true;
      clientCache.set(AUTH_FAILURE_KEY, true, authBackoffDuration, true);

      edgeLogger.debug(`Auth failure #${authFailureCount}: Setting cooldown for ${authBackoffDuration / 1000}s (${Math.round(authBackoffDuration / 60000)} minutes)`, { category: 'auth' });

      // Set a timer to automatically clear the cooldown
      authFailureTimer = setTimeout(() => {
        isInAuthFailureCooldown = false;
        clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
        edgeLogger.debug('Auth failure cooldown period expired', { category: 'auth' });
      }, authBackoffDuration);
    } else {
      // If explicitly marking auth as successful, clear the failure state
      isInAuthFailureCooldown = false;
      authFailureCount = 0;
      authBackoffDuration = MIN_AUTH_COOLDOWN;

      // Clear all failure-related flags
      clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
      clientCache.set(AUTH_FAILURE_COUNT_KEY, 0, Infinity, true);
      clientCache.remove(AUTH_FAILURE_LAST_TIME_KEY, true);
      clientCache.set(AUTH_BACKOFF_DURATION_KEY, MIN_AUTH_COOLDOWN, Infinity, true);

      edgeLogger.debug('Auth failure state cleared - auth is now successful', { category: 'auth' });
    }
  } catch (e) {
    edgeLogger.warn('Error setting auth failure state', {
      category: 'auth',
      error: e instanceof Error ? e.message : 'Unknown error'
    });
  }
}

// Initialize auth failure state from persistent storage
try {
  // Attempt to restore auth failure state from cache
  isInAuthFailureCooldown = !!clientCache.get(AUTH_FAILURE_KEY, Infinity, true);
  authFailureCount = clientCache.get(AUTH_FAILURE_COUNT_KEY, Infinity, true) || 0;
  const lastFailureTime = clientCache.get(AUTH_FAILURE_LAST_TIME_KEY, Infinity, true) || 0;
  authBackoffDuration = clientCache.get(AUTH_BACKOFF_DURATION_KEY, Infinity, true) || MIN_AUTH_COOLDOWN;

  // Check if we should still be in a cooldown period
  if (isInAuthFailureCooldown) {
    // Calculate time elapsed since last failure
    const now = Date.now();
    const elapsedTime = now - lastFailureTime;

    // Check if cooldown period has already expired
    if (elapsedTime >= authBackoffDuration) {
      // Cooldown expired, reset the state
      isInAuthFailureCooldown = false;
      clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
      edgeLogger.debug('Restored auth state: Cooldown expired', { category: 'auth' });
    } else {
      // Still in cooldown period, setup a timer for remaining time
      const remainingTime = authBackoffDuration - elapsedTime;
      edgeLogger.debug(`Auth failure state: ${authFailureCount} failures, ${Math.round(remainingTime / 1000)}s cooldown remaining`, { category: 'auth' });

      authFailureTimer = setTimeout(() => {
        isInAuthFailureCooldown = false;
        clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
        edgeLogger.debug('Auth failure cooldown period expired', { category: 'auth' });
      }, remainingTime);
    }
  } else {
    // Don't log anything about auth state initialization
  }
} catch (e) {
  // Log and ignore cache errors
  edgeLogger.warn('Error initializing auth failure state from cache', {
    category: 'auth',
    error: e instanceof Error ? e.message : 'Unknown error'
  });
}

/**
 * History service provides methods for fetching and managing chat history
 * with client-side caching and improved error handling.
 */
export const historyService = {
  /**
   * Check if we're currently in an auth failure cooldown period
   * @returns True if in auth failure cooldown
   */
  isInAuthFailure(): boolean {
    // Check for recent unauthorized responses first (fastest check)
    // This provides immediate circuit breaking when flood is detected
    if (recentUnauthorizedRequests.length >= UNAUTHORIZED_THRESHOLD) {
      // Activate the circuit breaker if we hit the threshold
      if (!isInAuthFailureCooldown) {
        edgeLogger.warn(`Circuit breaker activating from isInAuthFailure check - ${recentUnauthorizedRequests.length} recent 401s`, { category: 'auth' });
        setAuthFailureState(true);
      }
      return true;
    }

    // CRITICAL FIX: Always check persistent storage next, as it is the source of truth
    try {
      const persistentState = !!clientCache.get(AUTH_FAILURE_KEY, Infinity, true);

      // If memory state doesn't match storage, update memory
      if (isInAuthFailureCooldown !== persistentState) {
        isInAuthFailureCooldown = persistentState;

        // Log mismatch detection at low frequency
        if (Math.random() < 0.1) {
          edgeLogger.debug(`Auth failure state updated from storage: ${persistentState}`, { category: 'auth' });
        }
      }

      return persistentState;
    } catch (e) {
      // Default to memory state if storage access fails
      return isInAuthFailureCooldown;
    }
  },

  /**
   * Get detailed information about the current auth failure state
   */
  getAuthFailureInfo(): {
    isInCooldown: boolean;
    failureCount: number;
    backoffDuration: number;
    remainingTime: number;
    lastFailureTime: number;
  } {
    const now = Date.now();
    const lastFailureTime = clientCache.get(AUTH_FAILURE_LAST_TIME_KEY, Infinity, true) || 0;
    const backoffDuration = clientCache.get(AUTH_BACKOFF_DURATION_KEY, Infinity, true) || MIN_AUTH_COOLDOWN;
    const elapsedTime = now - lastFailureTime;
    const remainingTime = Math.max(0, backoffDuration - elapsedTime);

    return {
      isInCooldown: this.isInAuthFailure(),
      failureCount: clientCache.get(AUTH_FAILURE_COUNT_KEY, Infinity, true) || 0,
      backoffDuration,
      remainingTime,
      lastFailureTime
    };
  },

  /**
   * Reset the auth failure state and allow fetching again
   */
  resetAuthFailure(): void {
    setAuthFailureState(false);
    edgeLogger.debug('Auth failure state manually reset', { category: 'auth' });
  },

  /**
   * Fetch chat history with client-side caching
   * @param forceRefresh Whether to force a refresh from API
   * @returns Array of chat objects
   */
  async fetchHistory(forceRefresh = false, isMobileOpen = false): Promise<Chat[]> {
    // Generate operation ID for tracking
    const operationId = Math.random().toString(36).substring(2, 10);

    // Check if we're in an auth failure cooldown period
    if (this.isInAuthFailure() && !forceRefresh) {
      console.debug(`[HistoryService] Skipping fetchHistory due to auth failure cooldown`);

      // Return cached data if available
      try {
        const cachedData = clientCache.get('chat_history') as Chat[] | undefined;
        return (cachedData && Array.isArray(cachedData) && cachedData.length > 0) ? cachedData : [];
      } catch (e) {
        return [];
      }
    }

    // Auto-reset the auth failure state every 2 minutes to allow retries
    // This is a failsafe to prevent permanent lockout
    const authInfo = this.getAuthFailureInfo();
    if (authInfo.isInCooldown && authInfo.remainingTime > 2 * 60 * 1000) {
      console.debug(`[HistoryService] Auto-resetting auth failure state after ${Math.round(authInfo.remainingTime / 60000)} minutes`);
      this.resetAuthFailure();
    }

    // Add enhanced debug logging
    console.debug(`[HistoryService] Fetching history (forceRefresh=${forceRefresh})`, {
      inAuthFailure: this.isInAuthFailure(),
      authInfo: this.getAuthFailureInfo(),
      unauthorizedRequests: recentUnauthorizedRequests.length
    });

    // Create a consistent cache key
    const cacheKey = 'chat_history';

    // Use throttling to prevent too many API calls
    const now = Date.now();
    const timeSinceLastRequest = now - lastHistoryRequestTime;

    if (!forceRefresh && timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      console.debug(`[HistoryService] Throttling: Last request was ${Math.round(timeSinceLastRequest / 1000)}s ago`);

      // Return cached data if available
      try {
        const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
        return (cachedData && Array.isArray(cachedData) && cachedData.length > 0) ? cachedData : [];
      } catch (e) {
        return [];
      }
    }

    // Update the last request time (even if we're going to fail-fast due to circuit breaker)
    lastHistoryRequestTime = now;

    // -------------------- ENHANCED CIRCUIT BREAKER PATTERN --------------------
    // Before doing ANYTHING AT ALL, check for auth failure state - not even creating IDs or timestamps
    if (this.isInAuthFailure()) {
      // ABSOLUTE FAIL-FAST: Return empty array immediately
      // This is the core of the circuit breaker pattern - no work at all is done

      // Low-frequency logging to avoid console spam (only 1% of calls will log)
      if (Math.random() < 0.01) {
        try {
          const failureInfo = this.getAuthFailureInfo();
          edgeLogger.warn(`History fetch blocked by circuit breaker. Cooldown: ${Math.round(failureInfo.remainingTime / 1000)}s remaining`, { category: 'auth' });
        } catch (e) {
          // Completely suppress errors in failure state logging to ensure absolute fail-fast
        }
      }

      // Use cached data if available, otherwise return empty array
      try {
        const cachedData = clientCache.get('chat_history') as Chat[] | undefined;
        return (cachedData && Array.isArray(cachedData) && cachedData.length > 0) ? cachedData : [];
      } catch (e) {
        // Completely ignore cache errors in failure state
        return [];
      }
    }

    // Rate limit check - use adaptive refresh interval
    // Note: we reuse the 'now' value set above to ensure consistency
    const timeSinceLastFetch = now - lastSuccessfulFetch;

    // Only allow forced refreshes more often than the minimum interval
    if (!forceRefresh && timeSinceLastFetch < MIN_REFRESH_INTERVAL) {
      edgeLogger.debug(`Throttling history fetch: ${(MIN_REFRESH_INTERVAL - timeSinceLastFetch) / 1000}s remaining`, { category: 'auth' });
      // Return cached data immediately
      try {
        const cachedData = clientCache.get('chat_history') as Chat[] | undefined;
        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          return cachedData;
        }
      } catch (e) {
        // Ignore cache errors
      }
    }

    const startTime = performance.now();

    try {
      // Double-check auth failure state again (could have changed during async ops)
      if (this.isInAuthFailure()) {
        // Try to return cached data if available (preferable to empty array)
        try {
          const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
          if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
            return cachedData;
          }
        } catch (e) {
          // Ignore cache errors, return empty array
        }

        return [];
      }

      // If already loading, don't start a new request
      if (pendingRequests[cacheKey]) {
        edgeLogger.debug(`[History:${operationId}] Reusing existing in-flight request`, { category: 'auth' });
        try {
          return await pendingRequests[cacheKey]!;
        } catch (error) {
          edgeLogger.error(`[History:${operationId}] Error from in-flight request:`, {
            category: 'auth',
            error: error instanceof Error ? error.message : String(error)
          });
          // On error, clear the pending request and continue with a new fetch
          pendingRequests[cacheKey] = null;
        }
      }

      // Log fetching attempt at reduced frequency
      if (Math.random() < 0.2 || forceRefresh) {
        edgeLogger.debug(`[History:${operationId}] Fetching chat history`, {
          category: 'auth',
          forceRefresh,
          cacheKey,
          hasPendingRequest: !!pendingRequests[cacheKey],
          timeSinceLastFetch: timeSinceLastFetch / 1000,
          timestamp: new Date().toISOString()
        });
      }

      // Try cache first if not forcing refresh
      if (!forceRefresh) {
        try {
          // Use the TTL parameter of the client cache
          const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
          if (cachedData && cachedData.length > 0) {
            // Only log cache hits at reduced frequency
            if (Math.random() < 0.2) {
              edgeLogger.debug(`[History:${operationId}] Using cached data with ${cachedData.length} items`, { category: 'auth' });
            }

            // Check if we need a background refresh (only if not accessed recently)
            const timeSinceLastRefresh = Date.now() - lastRefreshTime;
            if (timeSinceLastRefresh > adaptiveRefreshInterval) {
              if (Math.random() < 0.2) {
                edgeLogger.debug(`[History:${operationId}] Starting background refresh after using cache (${Math.round(timeSinceLastRefresh / 1000)}s since last refresh)`, { category: 'auth' });
              }

              // Schedule a background refresh after a short delay
              setTimeout(() => {
                this.fetchHistoryFromAPI(cacheKey, `${operationId}-background`)
                  .then(freshData => {
                    // Update cache with fresh data
                    clientCache.set(cacheKey, freshData);

                    // Update adaptive refresh interval based on success
                    lastSuccessfulFetch = Date.now();
                    consecutiveSuccessfulFetches++;

                    // Gradually increase refresh interval after consecutive successes
                    if (consecutiveSuccessfulFetches > 3) {
                      adaptiveRefreshInterval = Math.min(
                        adaptiveRefreshInterval * 1.5,
                        REFRESH_INTERVAL
                      );
                    }
                  })
                  .catch(err => {
                    edgeLogger.error('Background refresh failed:', {
                      category: 'auth',
                      error: err instanceof Error ? err.message : String(err)
                    });
                    consecutiveSuccessfulFetches = 0;
                    // Decrease refresh interval on failure
                    adaptiveRefreshInterval = Math.max(
                      adaptiveRefreshInterval / 2,
                      MIN_REFRESH_INTERVAL
                    );
                  });
              }, 100);
            } else if (Math.random() < 0.1) {
              edgeLogger.debug(`[History:${operationId}] Skipping background refresh (only ${Math.round(timeSinceLastRefresh / 1000)}s since last refresh)`, { category: 'auth' });
            }

            return cachedData;
          } else {
            edgeLogger.debug(`[History:${operationId}] No valid cache data found, fetching from API`, { category: 'auth' });
          }
        } catch (cacheError) {
          edgeLogger.warn(`[History:${operationId}] Cache error:`, {
            category: 'auth',
            error: cacheError instanceof Error ? cacheError.message : String(cacheError)
          });
          // Continue with API fetch
        }
      } else {
        // Force refresh requested, invalidate cache
        edgeLogger.debug(`[History:${operationId}] Force refresh, invalidating cache`, { category: 'auth' });
        this.invalidateCache();
      }

      // Create and store the API fetch promise
      edgeLogger.debug(`[History:${operationId}] Fetching from API`, { category: 'auth' });
      pendingRequests[cacheKey] = this.fetchHistoryFromAPI(cacheKey, operationId);

      try {
        // Wait for the API request to complete
        const result = await pendingRequests[cacheKey]!;
        return result;
      } finally {
        // Clean up pending request after a short delay
        setTimeout(() => {
          pendingRequests[cacheKey] = null;
        }, 500);
      }
    } catch (error) {
      edgeLogger.error(`[History:${operationId}] Unexpected error:`, {
        category: 'auth',
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  },

  /**
   * Check if auth cookies exist to avoid unnecessary API calls
   * @returns Boolean indicating if auth cookies were found
   */
  checkForAuthCookies(): boolean {
    if (typeof document === 'undefined') return false;

    try {
      const cookies = document.cookie.split(';').map(c => c.trim());

      // Look specifically for Supabase auth token cookies
      const hasAuthCookie = cookies.some(c =>
        c.startsWith('sb-') &&
        c.includes('-auth-token') &&
        c !== 'sb-auth-token=' &&
        !c.endsWith('=')
      );

      // Log presence/absence of auth cookies at a reduced rate
      if (Math.random() < 0.01) {
        edgeLogger.debug(`Auth cookie check: ${hasAuthCookie ? 'Present' : 'Missing'}`, { category: 'auth' });
        if (!hasAuthCookie) {
          edgeLogger.debug('Cookie debug:', cookies.map(c => c.split('=')[0]));
        }
      }

      return hasAuthCookie;
    } catch (e) {
      edgeLogger.warn('Error checking auth cookies', {
        category: 'auth',
        error: e instanceof Error ? e.message : String(e)
      });
      return false;
    }
  },

  /**
   * Check if auth is completely ready by probing the auth status endpoint
   * This should be used before making any API calls that require authentication
   * @returns Promise resolving to true if auth is ready, false otherwise
   */
  async isAuthReady(): Promise<boolean> {
    // Cache key for storing auth ready state
    const AUTH_READY_KEY = 'auth_ready_state';
    const AUTH_READY_TIMESTAMP_KEY = 'auth_ready_timestamp';
    const AUTH_READY_TTL = 30000; // 30 seconds

    try {
      // Check if we have a cached auth ready state that's still valid
      const cachedState = clientCache.get(AUTH_READY_KEY) as boolean | undefined;
      const cachedTimestamp = clientCache.get(AUTH_READY_TIMESTAMP_KEY) as number | undefined;

      if (cachedState === true && cachedTimestamp && Date.now() - cachedTimestamp < AUTH_READY_TTL) {
        return true;
      }

      // No valid cached state, make a lightweight request to check auth status
      const probe = await fetch('/api/auth/status', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'x-operation-id': `auth_probe_${Math.random().toString(36).substring(2, 8)}`
        }
      });

      // Check if we got a successful response and the user is authenticated
      const authReady = probe.ok && probe.status === 200;
      const authState = probe.headers.get('x-auth-state');

      // Store the auth ready state
      clientCache.set(AUTH_READY_KEY, authReady, AUTH_READY_TTL);
      clientCache.set(AUTH_READY_TIMESTAMP_KEY, Date.now(), AUTH_READY_TTL);

      // Log auth state at a reduced rate (1% of the time)
      if (Math.random() < 0.01) {
        edgeLogger.debug(`Auth readiness check: ${authReady ? 'Ready' : 'Not ready'}, State: ${authState || 'unknown'}`, { category: 'auth' });
      }

      return authReady;
    } catch (e) {
      edgeLogger.warn('Error checking auth readiness', {
        category: 'auth',
        error: e instanceof Error ? e.message : String(e)
      });
      return false;
    }
  },

  /**
   * Fetch history data directly from API
   * @param cacheKey Cache key for deduplication
   * @param operationId Operation ID for tracing
   * @returns Array of chat objects
   */
  async fetchHistoryFromAPI(cacheKey: string, operationId: string): Promise<Chat[]> {
    try {
      // CRITICAL FIX #1: Check for cookies before making the request
      const hasCookies = this.checkForAuthCookies();
      if (!hasCookies) {
        edgeLogger.debug(`No auth cookies found, skipping history fetch to avoid 401`, { operationId });
        setAuthFailureState(true);
        return [];
      }

      // CRITICAL FIX #2: Check if auth is ready before making the request
      // This prevents the 401 errors that happen when the auth token is present but not yet valid
      const authReady = await this.isAuthReady();
      if (!authReady) {
        edgeLogger.debug(`Auth not ready yet, skipping history fetch to avoid 401`, { operationId });
        // Don't set failure state here, this is a normal condition during app initialization
        return [];
      }

      // Add abortTimeout to prevent hanging requests
      const abortController = new AbortController();
      const abortTimeout = setTimeout(() => abortController.abort(), 10000);

      // Add a unique operation ID for tracing
      const headers = new Headers();
      headers.append('Cache-Control', 'no-cache');
      headers.append('x-operation-id', operationId);

      // IMPROVED: Always use timestamp for consistent request pattern
      // Using precise timestamp instead of minute-based cachebusting for better uniqueness
      const timestamp = Date.now();

      // Track unauthorized request count to help with flood detection
      let urlParams = `t=${timestamp}`;

      // If we've had recent unauthorized requests, include the count in the next request
      // This helps the server track bursts of unauthorized requests
      if (recentUnauthorizedRequests.length > 0) {
        urlParams += `&unauth_count=${recentUnauthorizedRequests.length}`;
      }

      // Include auth ready marker in the URL to help with debugging
      urlParams += `&auth_ready=true`;

      const url = `/api/history?${urlParams}`;

      // Log request at low frequency to help debug auth issues
      if (Math.random() < 0.05) {
        edgeLogger.debug('Fetching history with cookies', {
          category: LOG_CATEGORIES.CHAT,
          hasCookies: hasCookies ? 'Yes' : 'No',
          timestamp: Date.now().toString() // Convert timestamp to string
        });
      }

      // Make the API request with consistent auth approach
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include', // Include cookies for auth - critical for consistency
        cache: 'no-store', // Ensure fresh data
        signal: abortController.signal,
        mode: 'same-origin' // Explicit same-origin policy to ensure cookies are sent
      });

      // Clear abort timeout
      clearTimeout(abortTimeout);

      // Check for authentication issues - 401 Unauthorized, 403 Forbidden, or 409 Conflict (auth pending)
      if (response.status === 401 || response.status === 403 || response.status === 409) {
        // Special handling for 409 Conflict - authentication pending
        if (response.status === 409) {
          edgeLogger.debug('Authentication pending for history API', {
            category: 'auth',
            message: 'Will retry shortly',
            status: response.status
          });

          // Don't count this toward unauthorized requests since it's just a timing issue
          // Instead, we'll use cached data and retry

          // Remove pending request
          delete pendingRequests[cacheKey];

          // Return cached data if available
          try {
            const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
            return (cachedData && Array.isArray(cachedData) && cachedData.length > 0) ? cachedData : [];
          } catch (e) {
            return [];
          }
        }

        // Standard 401/403 handling
        // Get unauthorized count from response headers if available
        // This helps coordinate between multiple clients/components
        let unauthorizedCount = recentUnauthorizedRequests.length;
        const headerCount = parseInt(response.headers.get('x-unauthorized-count') || '0');

        if (headerCount > 0) {
          // Use the higher count between local tracking and server header
          unauthorizedCount = Math.max(unauthorizedCount, headerCount);

          // If server reports high count, ensure we're tracking enough locally
          if (headerCount > unauthorizedCount) {
            // Add timestamps to match the server count
            const diff = headerCount - unauthorizedCount;
            const now = Date.now();
            for (let i = 0; i < diff; i++) {
              // Spread them out slightly in the window
              recentUnauthorizedRequests.push(now - (i * 100));
            }
          }
        }

        // Check if cookies were present but auth failed
        const hasAuthCookies = response.headers.get('x-has-auth-cookies') === 'true';

        // Track recent unauthorized responses to detect floods
        const now = Date.now();
        recentUnauthorizedRequests.push(now);

        // Remove unauthorized responses older than our tracking window
        recentUnauthorizedRequests = recentUnauthorizedRequests.filter(
          time => now - time < UNAUTHORIZED_WINDOW
        );

        // Recalculate after filtering
        unauthorizedCount = recentUnauthorizedRequests.length;

        // Immediate circuit breaker activation if threshold exceeded
        if (unauthorizedCount >= UNAUTHORIZED_THRESHOLD) {
          // Handle auth failure with enhanced circuit breaker pattern
          setAuthFailureState(true);

          // Don't clear tracking array - we'll use it for duration of the cooldown
          // to catch any further requests during the initial delay

          edgeLogger.warn(`AUTH FLOOD DETECTED: ${unauthorizedCount} unauthorized responses in the last ${UNAUTHORIZED_WINDOW / 1000}s. Circuit breaker activated for ${Math.round(authBackoffDuration / 1000)}s.`, {
            operationId,
            url,
            responseStatus: response.status
          });
        } else {
          // Log at reduced frequency
          if (unauthorizedCount < 3 || Math.random() < 0.2) {
            edgeLogger.warn(`Authentication failed (${response.status}) when fetching history. Monitoring for flood (${unauthorizedCount}/${UNAUTHORIZED_THRESHOLD}).`, {
              operationId,
              url,
              hasAuthCookies
            });
          }
        }

        // Remove pending request
        delete pendingRequests[cacheKey];

        return [];
      }

      // Reset auth failure state only on successful response
      if (response.ok) {
        setAuthFailureState(false);
      }

      // Parse response
      const data = await response.json();

      // If we get an object with an error property, handle it gracefully
      if (data && typeof data === 'object' && 'error' in data) {
        edgeLogger.error('API returned an error response', {
          error: data.error,
          operationId,
          url
        });

        // If it's an authentication error, trigger the circuit breaker
        if (data.error === 'Unauthorized') {
          setAuthFailureState(true);
        }

        // Return empty array for consistent behavior
        return [];
      }

      // Validate response format - expect an array of chat objects
      if (!Array.isArray(data)) {
        edgeLogger.error('Invalid history API response format', {
          data,
          type: typeof data,
          operationId
        });

        // Set empty array in cache to prevent continuous spinning
        clientCache.set('chat_history', [], CACHE_TTL_ERROR);

        // Return empty array instead of throwing, to avoid spinning UI
        return [];
      }

      // Cache the fetched data
      clientCache.set('chat_history', data, CACHE_TTL);

      // Return the data
      return data as Chat[];
    } catch (error) {
      // API request error - but NOT auth failure (that's handled above)
      edgeLogger.error('Error fetching history from API', {
        error: error instanceof Error ? error.message : String(error),
        operationId
      });

      // Clean up pending request
      delete pendingRequests[cacheKey];

      // Cache empty array temporarily to prevent continuous spinning
      clientCache.set('chat_history', [], CACHE_TTL_ERROR);

      // Return empty array instead of throwing
      return [];
    }
  },

  /**
   * Delete a chat by ID and update the cache
   * @param id Chat ID to delete
   * @returns Success status
   */
  async deleteChat(id: string): Promise<boolean> {
    const startTime = performance.now();
    const operationId = Math.random().toString(36).substring(2, 10);

    if (!id) {
      edgeLogger.error(`[History:${operationId}] Invalid chat ID for deletion`);
      return false;
    }

    edgeLogger.debug('Deleting chat', {
      category: LOG_CATEGORIES.CHAT,
      operation: 'delete_chat',
      operationId,
      chatId: id
    });

    try {
      // Add timestamp for consistency with fetchHistory pattern
      const timestamp = Date.now();
      const url = `/api/history?id=${encodeURIComponent(id)}&t=${timestamp}`;

      // CRITICAL: Use same authentication approach as fetchHistory
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include', // Include cookies for auth - critical for consistency
        cache: 'no-store', // Ensure fresh data
        mode: 'same-origin', // Explicit same-origin policy to ensure cookies are sent
        headers: {
          'x-operation-id': operationId,
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const duration = Math.round(performance.now() - startTime);

        // Check for auth issues
        if (response.status === 401 || response.status === 403) {
          // Handle auth failure consistently with fetchHistory
          setAuthFailureState(true);
          edgeLogger.warn(`[History:${operationId}] Authentication failed (${response.status}) when deleting chat.`, {
            chatId: id,
            url,
            withTimestamp: true
          });
        } else {
          edgeLogger.error(`[History:${operationId}] Failed to delete chat:`, {
            statusCode: response.status,
            statusText: response.statusText,
            errorData,
            duration,
            chatId: id,
            url
          });
        }

        return false;
      }

      // Reset auth failure state on success
      setAuthFailureState(false);

      const duration = Math.round(performance.now() - startTime);
      edgeLogger.debug('Successfully deleted chat', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'delete_chat',
        operationId,
        chatId: id,
        status: response.status
      });

      // Invalidate chat history cache immediately after successful deletion
      edgeLogger.debug('Invalidating cache after chat deletion', {
        category: LOG_CATEGORIES.SYSTEM, // Using SYSTEM for cache operations
        operation: 'invalidate_cache',
        operationId
      });
      this.invalidateCache();

      // Update existing cache to filter out the deleted chat
      try {
        const cacheKey = 'chat_history';
        const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;

        if (cachedData) {
          edgeLogger.debug('Updating cached chat list after deletion', {
            category: LOG_CATEGORIES.SYSTEM, // Using SYSTEM for cache operations
            operation: 'update_cache',
            operationId
          });
          const updatedChats = cachedData.filter((chat: Chat) => chat.id !== id);
          clientCache.set(cacheKey, updatedChats);
          edgeLogger.debug('Chat removed from cache successfully', {
            category: LOG_CATEGORIES.SYSTEM, // Using SYSTEM for cache operations
            operation: 'update_cache',
            operationId,
            chatId: id
          });
        }
      } catch (cacheError) {
        edgeLogger.warn(`[History:${operationId}] Error updating cache after deletion:`, {
          error: cacheError instanceof Error ? cacheError.message : String(cacheError)
        });
      }

      return true;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      edgeLogger.error(`[History:${operationId}] Error deleting chat:`, {
        error: error instanceof Error ? error.message : String(error),
        duration,
        chatId: id,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },

  /**
   * Rename a chat session
   * @param chatId ID of the chat to rename
   * @param title New title for the chat
   * @returns Promise resolving to success status
   */
  async renameChat(chatId: string, title: string): Promise<boolean> {
    const startTime = performance.now();
    const operationId = Math.random().toString(36).substring(2, 10);

    if (!chatId || !title.trim()) {
      edgeLogger.error(`[History:${operationId}] Invalid chat ID or title for rename operation`);
      return false;
    }


    try {
      // Check for auth cookies to avoid unnecessary API calls
      if (!this.checkForAuthCookies()) {
        edgeLogger.warn(`[History:${operationId}] No auth cookies found, cannot rename chat`);
        return false;
      }

      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-operation-id': operationId
        },
        credentials: 'include', // Include cookies for auth
        cache: 'no-store', // Ensure fresh data
        body: JSON.stringify({ title })
      });

      if (!response.ok) {
        const duration = Math.round(performance.now() - startTime);

        // Check for auth issues
        if (response.status === 401 || response.status === 403) {
          // Handle auth failure consistently with other methods
          setAuthFailureState(true);
          edgeLogger.warn(`[History:${operationId}] Authentication failed (${response.status}) when renaming chat.`, {
            chatId: chatId.slice(0, 8),
            duration
          });
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          edgeLogger.error(`[History:${operationId}] Failed to rename chat:`, {
            statusCode: response.status,
            statusText: response.statusText,
            errorText,
            duration,
            chatId: chatId.slice(0, 8)
          });
        }
        return false;
      }

      // Reset auth failure state on success
      setAuthFailureState(false);

      // Invalidate chat history cache
      this.invalidateCache();

      // Update existing cache to reflect the renamed chat
      try {
        const cacheKey = 'chat_history';
        const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;

        if (cachedData) {
          edgeLogger.debug(`[History:${operationId}] Updating cached chat list after rename`);
          const updatedChats = cachedData.map((chat: Chat) => {
            if (chat.id === chatId) {
              return { ...chat, title };
            }
            return chat;
          });
          clientCache.set(cacheKey, updatedChats);
        }
      } catch (cacheError) {
        edgeLogger.warn(`[History:${operationId}] Error updating cache after rename:`, {
          error: cacheError instanceof Error ? cacheError.message : String(cacheError)
        });
      }

      const duration = Math.round(performance.now() - startTime);
      edgeLogger.debug(`[History:${operationId}] Successfully renamed chat`, {
        chatId: chatId.slice(0, 8),
        duration
      });

      return true;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      edgeLogger.error(`[History:${operationId}] Error renaming chat:`, {
        error: error instanceof Error ? error.message : String(error),
        duration,
        chatId: chatId.slice(0, 8),
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },

  /**
   * Invalidate cache and clear any stale pending requests
   */
  invalidateCache(): void {
    const operationId = Math.random().toString(36).substring(2, 10);
    edgeLogger.debug(`[History:${operationId}] Invalidating chat history cache`);

    const cacheKey = 'chat_history';

    // Clear the cache
    try {
      clientCache.remove(cacheKey);
    } catch (error: any) {
      edgeLogger.warn(`[History:${operationId}] Error clearing history cache:`, error);
    }

    // Clean up any stale pending requests
    pendingRequests[cacheKey] = null;

    edgeLogger.debug(`[History:${operationId}] Chat history cache invalidated`);
  },

  /**
   * Manually refresh the chat history
   * This is useful when we know the cache is stale
   */
  async refreshHistory(): Promise<Chat[]> {
    const operationId = Math.random().toString(36).substring(2, 10);
    edgeLogger.debug(`[History:${operationId}] Manually refreshing chat history`);
    return await this.fetchHistory(true);
  },

  /**
   * Check if a specific chat exists in history
   * @param chatId The chat ID to check
   * @param autoRefresh Whether to auto-refresh if not found
   * @returns Boolean indicating if the chat exists
   */
  async chatExists(chatId: string, autoRefresh = true): Promise<boolean> {
    const operationId = Math.random().toString(36).substring(2, 10);

    if (!chatId) return false;

    try {
      // Get chat history, potentially from cache
      let chats = await this.fetchHistory(false);
      let exists = chats.some(chat => chat.id === chatId);

      edgeLogger.debug(`[History:${operationId}] Chat existence check`, {
        chatId: chatId.slice(0, 8),
        exists,
        totalChats: chats.length
      });

      // If not found and autoRefresh is true, try refreshing
      if (!exists && autoRefresh) {
        edgeLogger.debug(`[History:${operationId}] Chat ${chatId.slice(0, 8)} not found in history, refreshing`);
        chats = await this.refreshHistory();
        exists = chats.some(chat => chat.id === chatId);

        if (!exists) {
          edgeLogger.warn(`[History:${operationId}] Chat ${chatId.slice(0, 8)} still not found after refresh`, {
            chatCount: chats.length,
            existingIds: chats.slice(0, 3).map(c => c.id.slice(0, 8))
          });
        } else {
          edgeLogger.debug(`[History:${operationId}] Chat ${chatId.slice(0, 8)} found after refresh`);
        }
      }

      return exists;
    } catch (error) {
      edgeLogger.error(`[History:${operationId}] Error checking if chat exists:`, {
        error: error instanceof Error ? error.message : String(error),
        chatId: chatId.slice(0, 8),
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },

  /**
   * Create a new chat session in the database
   * @returns The newly created session ID and success status
   */
  async createNewSession(): Promise<{ id: string; success: boolean; error?: string }> {
    const operationId = Math.random().toString(36).substring(2, 10);
    const sessionId = generateUUID();

    // Track pending session creation requests
    const pendingKey = `creating_session_${sessionId}`;

    // Check if there's already a request in flight for this session
    if (typeof window !== 'undefined' && (window as any)[pendingKey]) {
      edgeLogger.debug(`[History:${operationId}] Reusing existing session creation request for ${sessionId}`);
      return (window as any)[pendingKey];
    }

    edgeLogger.debug(`[History:${operationId}] Creating new chat session`, { sessionId });

    try {
      // Store the promise for potential reuse
      if (typeof window !== 'undefined') {
        (window as any)[pendingKey] = (async () => {
          try {
            const response = await fetch('/api/chat/session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'x-operation-id': operationId
              },
              credentials: 'include', // Include cookies for auth
              cache: 'no-store', // Ensure fresh data
              mode: 'same-origin', // Explicit same-origin policy
              body: JSON.stringify({
                id: sessionId,
                title: 'New Conversation', // Default title
                agentId: 'default',
                deepSearchEnabled: false
              })
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

              edgeLogger.error(`[History:${operationId}] Failed to create chat session:`, {
                statusCode: response.status,
                statusText: response.statusText,
                errorData,
                sessionId
              });

              return {
                id: sessionId,
                success: false,
                error: errorData.error || `Server error: ${response.status}`
              };
            }

            const data = await response.json();

            edgeLogger.debug(`[History:${operationId}] Successfully created chat session`, {
              sessionId,
              responseData: data
            });

            // Invalidate chat history cache to ensure the new session shows up
            this.invalidateCache();

            return { id: sessionId, success: true };
          } catch (error) {
            edgeLogger.error(`[History:${operationId}] Error creating new chat session:`, {
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              message: error instanceof Error ? error.message : String(error)
            });

            return {
              id: sessionId,
              success: false,
              error: error instanceof Error ? error.message : String(error)
            };
          } finally {
            // Clear the pending request reference after a delay
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                (window as any)[pendingKey] = null;
              }
            }, 1000);
          }
        })();

        return (window as any)[pendingKey];
      } else {
        // Server-side fallback
        const response = await fetch('/api/chat/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'x-operation-id': operationId
          },
          credentials: 'include', // Include cookies for auth
          cache: 'no-store', // Ensure fresh data
          mode: 'same-origin', // Explicit same-origin policy
          body: JSON.stringify({
            id: sessionId,
            title: 'New Conversation', // Default title
            agentId: 'default',
            deepSearchEnabled: false
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

          edgeLogger.error(`[History:${operationId}] Failed to create chat session:`, {
            statusCode: response.status,
            statusText: response.statusText,
            errorData,
            sessionId
          });

          return {
            id: sessionId,
            success: false,
            error: errorData.error || `Server error: ${response.status}`
          };
        }

        const data = await response.json();

        edgeLogger.debug(`[History:${operationId}] Successfully created chat session`, {
          sessionId,
          responseData: data
        });

        // Invalidate chat history cache to ensure the new session shows up
        this.invalidateCache();

        return { id: sessionId, success: true };
      }
    } catch (error) {
      edgeLogger.error(`[History:${operationId}] Error creating new chat session:`, {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        message: error instanceof Error ? error.message : String(error)
      });

      return {
        id: sessionId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}; 