import { clientCache } from '@/lib/cache/client-cache';
import { Chat } from '@/lib/db/schema';
import { randomUUID } from 'crypto';

// Keep track of pending requests to deduplicate
const pendingRequests: Record<string, Promise<Chat[]> | null> = {};

// Track last refresh time
let lastRefreshTime = 0;
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache TTL
const CACHE_TTL_ERROR = 10 * 60 * 1000; // 10 minutes cache TTL for error state

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
      
      console.log(`Auth failure #${authFailureCount}: Setting cooldown for ${authBackoffDuration/1000}s (${Math.round(authBackoffDuration/60000)} minutes)`);
      
      // Set a timer to automatically clear the cooldown
      authFailureTimer = setTimeout(() => {
        isInAuthFailureCooldown = false;
        clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
        console.log('Auth failure cooldown period expired');
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
      
      console.log('Auth failure state cleared - auth is now successful');
    }
  } catch (e) {
    console.warn('Error setting auth failure state:', e);
  }
}

// Initialize auth failure state from persistent storage
try {
  // Get stored failure state
  const storedFailureState = clientCache.get(AUTH_FAILURE_KEY, Infinity, true);
  isInAuthFailureCooldown = !!storedFailureState;
  
  // Get stored failure count and backoff info
  authFailureCount = clientCache.get(AUTH_FAILURE_COUNT_KEY, Infinity, true) || 0;
  const lastFailureTime = clientCache.get(AUTH_FAILURE_LAST_TIME_KEY, Infinity, true) || 0;
  authBackoffDuration = clientCache.get(AUTH_BACKOFF_DURATION_KEY, Infinity, true) || MIN_AUTH_COOLDOWN;
  
  // Log auth cookie information if available
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const authCookies = cookies.filter(c => c.includes('auth-token'));
    console.log('Auth Cookies:', cookies);
  }
  
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
      console.log('Restored auth state: Cooldown already expired');
    } else {
      // Still in cooldown period, setup a timer for remaining time
      const remainingTime = authBackoffDuration - elapsedTime;
      console.log(`Restored auth failure state: ${authFailureCount} failures, ${Math.round(remainingTime/1000)}s remaining in cooldown`);
      
      authFailureTimer = setTimeout(() => {
        isInAuthFailureCooldown = false;
        clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
        console.log('Auth failure cooldown period expired');
      }, remainingTime);
    }
  } else {
    console.log('Initialized with clean auth state (no active cooldown)');
  }
} catch (e) {
  // Log and ignore cache errors
  console.warn('Error initializing auth failure state from cache:', e);
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
    // CRITICAL FIX: Always check persistent storage first, as it is the source of truth
    try {
      const persistentState = !!clientCache.get(AUTH_FAILURE_KEY, Infinity, true);
      
      // If memory state doesn't match storage, update memory
      if (isInAuthFailureCooldown !== persistentState) {
        isInAuthFailureCooldown = persistentState;
        
        // Log mismatch detection at low frequency
        if (Math.random() < 0.1) {
          console.log(`Auth failure state updated from storage: ${persistentState}`);
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
    console.log('Auth failure state manually reset');
  },

  /**
   * Fetch chat history with client-side caching
   * @param forceRefresh Whether to force a refresh from API
   * @returns Array of chat objects
   */
  async fetchHistory(forceRefresh = false): Promise<Chat[]> {
    // -------------------- ENHANCED CIRCUIT BREAKER PATTERN --------------------
    // Before doing ANYTHING AT ALL, check for auth failure state - not even creating IDs or timestamps
    if (this.isInAuthFailure()) {
      // ABSOLUTE FAIL-FAST: Return empty array immediately
      // This is the core of the circuit breaker pattern - no work at all is done
      
      // Low-frequency logging to avoid console spam (only 1% of calls will log)
      if (Math.random() < 0.01) {
        try {
          const failureInfo = this.getAuthFailureInfo();
          console.warn(`History fetch blocked by circuit breaker. Cooldown: ${Math.round(failureInfo.remainingTime/1000)}s remaining`);
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
    
    const startTime = performance.now();
    const operationId = Math.random().toString(36).substring(2, 10);
    
    try {
      // Create a unique cache key based on user
      const cacheKey = 'chat_history';
      
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
      
      // Track this refresh time regardless of success/failure
      lastRefreshTime = Date.now();
      
      // If already loading, don't start a new request
      if (pendingRequests[cacheKey]) {
        console.log(`[History:${operationId}] Reusing existing in-flight request`);
        try {
          return await pendingRequests[cacheKey]!;
        } catch (error) {
          console.error(`[History:${operationId}] Error from in-flight request:`, error);
          // On error, clear the pending request and continue with a new fetch
          pendingRequests[cacheKey] = null;
        }
      }
      
      // Log fetching attempt
      console.log(`[History:${operationId}] Fetching chat history`, {
        forceRefresh,
        cacheKey,
        hasPendingRequest: !!pendingRequests[cacheKey],
        timestamp: new Date().toISOString()
      });
      
      // Try cache first if not forcing refresh
      if (!forceRefresh) {
        try {
          // Use the TTL parameter of the client cache (2 minutes)
          const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
          if (cachedData && cachedData.length > 0) {
            console.log(`[History:${operationId}] Using cached data with ${cachedData.length} items`);
            
            // Check if we need a background refresh (only if not accessed recently)
            const timeSinceLastRefresh = Date.now() - lastRefreshTime;
            if (timeSinceLastRefresh > REFRESH_INTERVAL) {
              console.log(`[History:${operationId}] Starting background refresh after using cache (${Math.round(timeSinceLastRefresh / 1000)}s since last refresh)`);
              // Schedule a background refresh after a short delay
              setTimeout(() => {
                this.fetchHistoryFromAPI(cacheKey, `${operationId}-background`)
                  .then(freshData => {
                    // Update cache with fresh data
                    clientCache.set(cacheKey, freshData);
                  })
                  .catch(err => console.error('Background refresh failed:', err));
              }, 100);
            } else {
              console.log(`[History:${operationId}] Skipping background refresh (only ${Math.round(timeSinceLastRefresh / 1000)}s since last refresh)`);
            }
            
            return cachedData;
          } else {
            console.log(`[History:${operationId}] No valid cache data found, fetching from API`);
          }
        } catch (cacheError) {
          console.warn(`[History:${operationId}] Cache error:`, cacheError);
          // Continue with API fetch
        }
      } else {
        // Force refresh requested, invalidate cache
        console.log(`[History:${operationId}] Force refresh, invalidating cache`);
        this.invalidateCache();
      }
      
      // Create and store the API fetch promise
      console.log(`[History:${operationId}] Fetching from API`);
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
      console.error(`[History:${operationId}] Unexpected error:`, error);
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
        console.log(`Auth cookie check: ${hasAuthCookie ? 'Present' : 'Missing'}`);
        if (!hasAuthCookie) {
          console.log('Cookie debug:', cookies.map(c => c.split('=')[0]));
        }
      }
      
      return hasAuthCookie;
    } catch (e) {
      console.warn('Error checking auth cookies:', e);
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
      // CRITICAL FIX: Check for cookies before making the request
      const hasCookies = this.checkForAuthCookies();
      if (!hasCookies) {
        console.warn(`No auth cookies found, skipping history fetch to avoid 401`, { operationId });
        setAuthFailureState(true);
        return [];
      }
      
      // Add abortTimeout to prevent hanging requests
      const abortController = new AbortController();
      const abortTimeout = setTimeout(() => abortController.abort(), 10000);

      // Add a unique operation ID for tracing
      const headers = new Headers();
      headers.append('Cache-Control', 'no-cache');
      headers.append('x-operation-id', operationId);
      
      // Add anti-cache parameter with reduced frequency (once per minute max)
      const cacheBuster = Math.floor(Date.now() / 60000);
      const url = `/api/history?t=${cacheBuster}`;
      
      // Log request to help debug auth issues
      console.log(`Fetching history with cookies: ${hasCookies ? 'Yes' : 'No'}`, { operationId });
      
      // Make the API request
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include', // Include cookies for auth
        signal: abortController.signal
      });
      
      // Clear abort timeout
      clearTimeout(abortTimeout);
      
      // Check for auth issues - 401 Unauthorized or 403 Forbidden
      if (response.status === 401 || response.status === 403) {
        // Handle auth failure with enhanced circuit breaker pattern
        setAuthFailureState(true);
        
        // More specific logging with error status
        console.warn(`Authentication failed (${response.status}) when fetching history. Circuit breaker activated for ${Math.round(authBackoffDuration/1000)}s.`, { operationId });
        
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
        console.error('API returned an error response', { 
          error: data.error,
          operationId 
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
        console.error('Invalid history API response format', { 
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
      console.error('Error fetching history from API', { 
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
      console.error(`[History:${operationId}] Invalid chat ID for deletion`);
      return false;
    }
    
    console.log(`[History:${operationId}] Deleting chat`, { chatId: id });
    
    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const duration = Math.round(performance.now() - startTime);
        
        console.error(`[History:${operationId}] Failed to delete chat:`, { 
          statusCode: response.status,
          statusText: response.statusText,
          errorData,
          duration,
          chatId: id
        });
        return false;
      }
      
      const duration = Math.round(performance.now() - startTime);
      console.log(`[History:${operationId}] Successfully deleted chat`, {
        chatId: id,
        duration
      });
      
      // Invalidate chat history cache immediately after successful deletion
      console.log(`[History:${operationId}] Invalidating cache after chat deletion`);
      this.invalidateCache();
      
      // Update existing cache to filter out the deleted chat
      try {
        const cacheKey = 'chat_history';
        const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
        
        if (cachedData) {
          console.log(`[History:${operationId}] Updating cached chat list after deletion`);
          const updatedChats = cachedData.filter((chat: Chat) => chat.id !== id);
          clientCache.set(cacheKey, updatedChats);
          console.log(`[History:${operationId}] Chat removed from cache successfully`, { 
            originalCount: cachedData.length, 
            newCount: updatedChats.length
          });
        }
      } catch (cacheError) {
        console.warn(`[History:${operationId}] Error updating cache after deletion:`, cacheError);
      }
      
      return true;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      console.error(`[History:${operationId}] Error deleting chat:`, {
        error,
        duration,
        chatId: id,
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
    console.log(`[History:${operationId}] Invalidating chat history cache`);
    
    const cacheKey = 'chat_history';
    
    // Clear the cache
    try {
      clientCache.remove(cacheKey);
    } catch (error: any) {
      console.warn(`[History:${operationId}] Error clearing history cache:`, error);
    }
    
    // Clean up any stale pending requests
    pendingRequests[cacheKey] = null;
    
    console.log(`[History:${operationId}] Chat history cache invalidated`);
  },

  /**
   * Manually refresh the chat history
   * This is useful when we know the cache is stale
   */
  async refreshHistory(): Promise<Chat[]> {
    const operationId = Math.random().toString(36).substring(2, 10);
    console.log(`[History:${operationId}] Manually refreshing chat history`);
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
      
      console.log(`[History:${operationId}] Chat existence check`, {
        chatId: chatId.slice(0, 8),
        exists,
        totalChats: chats.length
      });
      
      // If not found and autoRefresh is true, try refreshing
      if (!exists && autoRefresh) {
        console.log(`[History:${operationId}] Chat ${chatId.slice(0, 8)} not found in history, refreshing`);
        chats = await this.refreshHistory();
        exists = chats.some(chat => chat.id === chatId);
        
        if (!exists) {
          console.warn(`[History:${operationId}] Chat ${chatId.slice(0, 8)} still not found after refresh`, {
            chatCount: chats.length,
            existingIds: chats.slice(0, 3).map(c => c.id.slice(0, 8))
          });
        } else {
          console.log(`[History:${operationId}] Chat ${chatId.slice(0, 8)} found after refresh`);
        }
      }
      
      return exists;
    } catch (error) {
      console.error(`[History:${operationId}] Error checking if chat exists:`, {
        error,
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
    const sessionId = randomUUID();
    
    // Track pending session creation requests
    const pendingKey = `creating_session_${sessionId}`;
    
    // Check if there's already a request in flight for this session
    if (typeof window !== 'undefined' && (window as any)[pendingKey]) {
      console.log(`[History:${operationId}] Reusing existing session creation request for ${sessionId}`);
      return (window as any)[pendingKey];
    }

    console.log(`[History:${operationId}] Creating new chat session`, { sessionId });
    
    try {
      // Store the promise for potential reuse
      if (typeof window !== 'undefined') {
        (window as any)[pendingKey] = (async () => {
          try {
            const response = await fetch('/api/chat/session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                id: sessionId,
                title: 'New Conversation', // Default title
                agentId: 'default',
                deepSearchEnabled: false
              })
            });
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
              
              console.error(`[History:${operationId}] Failed to create chat session:`, { 
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
            
            console.log(`[History:${operationId}] Successfully created chat session`, {
              sessionId,
              responseData: data
            });
            
            // Invalidate chat history cache to ensure the new session shows up
            this.invalidateCache();
            
            return { id: sessionId, success: true };
          } catch (error) {
            console.error(`[History:${operationId}] Error creating new chat session:`, {
              error,
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: sessionId,
            title: 'New Conversation', // Default title
            agentId: 'default',
            deepSearchEnabled: false
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          
          console.error(`[History:${operationId}] Failed to create chat session:`, { 
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
        
        console.log(`[History:${operationId}] Successfully created chat session`, {
          sessionId,
          responseData: data
        });
        
        // Invalidate chat history cache to ensure the new session shows up
        this.invalidateCache();
        
        return { id: sessionId, success: true };
      }
    } catch (error) {
      console.error(`[History:${operationId}] Error creating new chat session:`, {
        error,
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