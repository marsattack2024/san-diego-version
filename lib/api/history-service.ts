/**
 * IMPORTANT: This file has been updated to use Cockatiel for circuit breaker functionality
 * to manage authentication and history API requests, including:
 * 1. Modern circuit breaker pattern with Cockatiel
 * 2. Status code 409 support for auth-in-progress state
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
import {
  circuitBreaker,
  ConsecutiveBreaker,
  CircuitState,
  handleAll,
  IFailureEvent
} from 'cockatiel';

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

// Cache keys and constants
const HISTORY_CACHE_KEY = 'chat_history';

// Create a circuit breaker with Cockatiel
export const historyCircuitBreaker = circuitBreaker(handleAll, {
  // Half-open after 30 seconds (much more reasonable than previous 30 minutes)
  halfOpenAfter: 30 * 1000,

  // Break after 5 consecutive failures (up from 3)
  breaker: new ConsecutiveBreaker(5)
});

// Add event listeners for monitoring circuit breaker state
historyCircuitBreaker.onBreak((reason) => {
  let errorMessage = 'Unknown error';

  // Check if it's an isolated circuit (manual break)
  if ('isolated' in reason) {
    errorMessage = 'Circuit manually isolated';
  }
  // Check if it's an error-based failure
  else if ('error' in reason) {
    errorMessage = reason.error instanceof Error ? reason.error.message : String(reason.error);
  }
  // Check if it's a value-based failure (from result filtering)
  else if ('value' in reason) {
    errorMessage = String(reason.value);
  }

  edgeLogger.warn('Circuit breaker opened - stopping history API calls', {
    category: LOG_CATEGORIES.AUTH,
    error: errorMessage,
    important: true
  });
});

historyCircuitBreaker.onReset(() => {
  edgeLogger.info('Circuit breaker reset - resuming normal history API calls', {
    category: LOG_CATEGORIES.AUTH
  });
});

historyCircuitBreaker.onHalfOpen(() => {
  edgeLogger.info('Circuit breaker half-open - testing history API calls', {
    category: LOG_CATEGORIES.AUTH
  });
});

/**
 * History service provides methods for fetching and managing chat history
 * with client-side caching and improved error handling using Cockatiel.
 */
export const historyService = {
  /**
   * Get the current circuit breaker state
   */
  getCircuitState(): {
    state: 'Closed' | 'Open' | 'HalfOpen' | 'Isolated';
    lastAttempt: Date | null;
    lastSuccess: Date | null;
    failureCount: number;
  } {
    // Create mapping for circuit states to readable strings
    const stateMap: Record<CircuitState, 'Closed' | 'Open' | 'HalfOpen' | 'Isolated'> = {
      [CircuitState.Closed]: 'Closed',
      [CircuitState.Open]: 'Open',
      [CircuitState.HalfOpen]: 'HalfOpen',
      [CircuitState.Isolated]: 'Isolated',
    };

    // Get current circuit breaker state
    const currentState = historyCircuitBreaker.state;

    return {
      state: stateMap[currentState],
      // These properties might not be directly accessible in the Cockatiel API
      // Using null as fallback values
      lastAttempt: null,
      lastSuccess: null,
      failureCount: 0
    };
  },

  /**
   * Manually reset the circuit breaker
   */
  resetCircuitBreaker(): void {
    // Circuit breaker can't be directly reset in Cockatiel
    // Isolate then let it recover normally
    if (historyCircuitBreaker.state !== CircuitState.Closed) {
      // First isolate and then immediately cancel the isolation
      // This is a workaround to force a reset
      historyCircuitBreaker.isolate();

      // Set to half-open which allows testing of the circuit again
      try {
        // @ts-ignore - Internal method call
        historyCircuitBreaker.onStateChange.emit(CircuitState.HalfOpen);
      } catch (e) {
        edgeLogger.warn('Failed to forcibly reset circuit breaker', {
          category: LOG_CATEGORIES.AUTH,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }

    this.invalidateCache();
    edgeLogger.info('Circuit breaker manually reset', {
      category: LOG_CATEGORIES.AUTH
    });
  },

  /**
   * Manually isolate (open) the circuit breaker
   */
  isolateCircuitBreaker(): void {
    historyCircuitBreaker.isolate();
    edgeLogger.info('Circuit breaker manually isolated', {
      category: LOG_CATEGORIES.AUTH
    });
  },

  /**
   * Legacy method for backward compatibility
   * @returns Always false, as we now use Cockatiel
   */
  isInAuthFailure(): boolean {
    return historyCircuitBreaker.state === CircuitState.Open ||
      historyCircuitBreaker.state === CircuitState.Isolated;
  },

  /**
   * Legacy method for backward compatibility
   */
  getAuthFailureInfo(): {
    isInCooldown: boolean;
    failureCount: number;
    backoffDuration: number;
    remainingTime: number;
    lastFailureTime: number;
  } {
    const circuitState = this.getCircuitState();

    return {
      isInCooldown: circuitState.state === 'Open' || circuitState.state === 'Isolated',
      failureCount: 0, // Not directly accessible in Cockatiel
      backoffDuration: 30000, // Fixed 30 seconds with Cockatiel
      remainingTime: 0, // Not applicable with Cockatiel's implementation
      lastFailureTime: Date.now() // Approximation
    };
  },

  /**
   * Legacy method for backward compatibility - now uses Cockatiel reset
   */
  resetAuthFailure(): void {
    this.resetCircuitBreaker();
  },

  /**
   * Fetch chat history with client-side caching and circuit breaker protection
   * @param forceRefresh Whether to force a refresh from API
   * @returns Array of chat objects
   */
  async fetchHistory(forceRefresh = false): Promise<Chat[]> {
    const operationId = `fetch_hist_${Math.random().toString(36).substring(2, 8)}`; // More specific ID
    const cacheKey = HISTORY_CACHE_KEY;

    edgeLogger.debug('fetchHistory called', {
      category: 'chat',
      operation: 'fetchHistory',
      operationId,
      forceRefresh,
      cacheKey
    });

    if (!forceRefresh) {
      try {
        const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
        if (cachedData && Array.isArray(cachedData)) { // Check if array, not just length > 0
          edgeLogger.info('Returning cached history data', { // Changed to info for visibility
            category: LOG_CATEGORIES.SYSTEM, // Temp use SYSTEM for Cache
            operation: 'fetchHistory',
            operationId,
            count: cachedData.length,
            cacheKey
          });
          return cachedData;
        } else {
          edgeLogger.debug('Cache miss or empty/invalid cache', {
            category: LOG_CATEGORIES.SYSTEM, // Temp use SYSTEM for Cache
            operation: 'fetchHistory',
            operationId,
            cacheKey,
            cacheValueType: typeof cachedData
          });
        }
      } catch (e) {
        edgeLogger.warn('Error reading from client cache', {
          category: LOG_CATEGORIES.SYSTEM, // Temp use SYSTEM for Cache
          operation: 'fetchHistory',
          operationId,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // Use circuit breaker to protect against repeated failures
    try {
      console.debug(`[HistoryService] Making API call to fetch history (operationId: ${operationId})`);

      // Execute within circuit breaker
      return await historyCircuitBreaker.execute(async () => {
        try {
          // Global request throttling
          const now = Date.now();
          const timeSinceLastRequest = now - lastHistoryRequestTime;
          if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            console.debug(`[HistoryService] Throttling history request for ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          lastHistoryRequestTime = Date.now();

          // Get the Supabase client
          const supabase = createClient();
          console.debug(`[HistoryService] Got Supabase client (operationId: ${operationId})`);

          // Make explicit authorization check for better error handling
          console.debug(`[HistoryService] Checking auth status (operationId: ${operationId})`);
          const { data: { user }, error: authError } = await supabase.auth.getUser();

          if (authError) {
            // Specific handling for auth errors
            console.error(`[HistoryService] Auth error: ${authError.message} (operationId: ${operationId})`);
            edgeLogger.error('Authentication error during history fetch', {
              category: LOG_CATEGORIES.AUTH,
              operation: 'fetchHistory',
              operationId,
              error: authError.message,
              important: true
            });
            throw new Error(`Authentication error: ${authError.message}`);
          }

          if (!user) {
            console.error(`[HistoryService] No authenticated user found (operationId: ${operationId})`);
            edgeLogger.error('No authenticated user for history fetch', {
              category: LOG_CATEGORIES.AUTH,
              operation: 'fetchHistory',
              operationId,
              important: true
            });
            throw new Error('No authenticated user');
          }

          console.debug(`[HistoryService] Authenticated as user ${user.id.substring(0, 8)} (operationId: ${operationId})`);

          // Fetch the chat sessions
          console.debug(`[HistoryService] Fetching chat sessions from DB (operationId: ${operationId})`);
          const { data: sessions, error: fetchError } = await supabase
            .from('sd_chat_sessions')
            .select('id, title, created_at, updated_at, agent_id, user_id, deep_search_enabled')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

          if (fetchError) {
            console.error(`[HistoryService] Fetch error: ${fetchError.message} (operationId: ${operationId})`);
            edgeLogger.error('Error fetching chat sessions', {
              category: LOG_CATEGORIES.CHAT,
              operation: 'fetchHistory',
              operationId,
              error: fetchError.message,
              important: true
            });
            throw new Error(`Error fetching chat sessions: ${fetchError.message}`);
          }

          if (!sessions) {
            console.error(`[HistoryService] No sessions returned from DB (operationId: ${operationId})`);
            throw new Error('No chat sessions found');
          }

          // Map sessions to the expected Chat format
          const chats: Chat[] = sessions.map(session => ({
            id: session.id,
            title: session.title || 'Untitled Chat',
            createdAt: session.created_at,
            updatedAt: session.updated_at,
            userId: session.user_id,
            messages: [],
            agentId: session.agent_id || 'default',
            deepSearchEnabled: session.deep_search_enabled || false
          }));

          console.debug(`[HistoryService] Successfully mapped ${chats.length} chats (operationId: ${operationId})`);

          // Cache the results
          try {
            clientCache.set(cacheKey, chats, CACHE_TTL);
            console.debug(`[HistoryService] Successfully cached ${chats.length} chats (operationId: ${operationId})`);
          } catch (cacheError) {
            console.warn(`[HistoryService] Error caching chat history: ${cacheError} (operationId: ${operationId})`);
            // Don't throw, just log it - we can continue without caching
          }

          // Track successful fetch - part of adaptive refresh logic
          lastSuccessfulFetch = Date.now();
          consecutiveSuccessfulFetches++;

          edgeLogger.info('Successfully fetched chat history', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'fetchHistory',
            operationId,
            count: chats.length,
            userId: user.id.substring(0, 8) // Only log part of ID for privacy
          });

          return chats;
        } catch (error) {
          // Log detailed error information
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;

          console.error(`[HistoryService] Error in fetchHistory: ${errorMessage} (operationId: ${operationId})`, {
            stack: errorStack
          });

          edgeLogger.error('Error fetching chat history', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'fetchHistory',
            operationId,
            error: errorMessage,
            errorStack,
            important: true
          });

          // Store empty array in cache on error to prevent repeated failures
          try {
            clientCache.set(cacheKey, [], CACHE_TTL_ERROR);
          } catch (cacheError) {
            // Just log caching errors
            console.warn(`[HistoryService] Error caching empty result on failure: ${cacheError}`);
          }

          // Rethrow for the circuit breaker to handle
          throw error;
        }
      });
    } catch (error) {
      // This handles circuit breaker errors
      console.error(`[HistoryService] Circuit breaker error: ${error instanceof Error ? error.message : String(error)}`);

      edgeLogger.error('Circuit breaker prevented history fetch', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'fetchHistory',
        operationId,
        error: error instanceof Error ? error.message : String(error),
        circuitState: this.getCircuitState().state,
        important: true
      });

      return []; // Return empty array on error
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
   * Internal method to fetch history data from API
   */
  async fetchHistoryFromAPI(cacheKey: string, operationId: string): Promise<Chat[]> {
    const fetchStartTime = Date.now(); // Track API call duration
    try {
      edgeLogger.debug('Executing fetchHistoryFromAPI', { category: 'chat', operationId });

      const hasCookies = this.checkForAuthCookies();
      if (!hasCookies) {
        edgeLogger.warn(`fetchHistoryFromAPI: No auth cookies found, skipping API call`, { /* ... */ });
        return [];
      }

      const authReady = await this.isAuthReady();
      if (!authReady) {
        edgeLogger.warn(`fetchHistoryFromAPI: Auth not ready, skipping API call`, { /* ... */ });
        return [];
      }

      edgeLogger.debug('fetchHistoryFromAPI: Auth checks passed, proceeding', { category: 'chat', operationId });

      const abortController = new AbortController();
      const abortTimeout = setTimeout(() => { /* ... */ }, 10000);

      const headers = new Headers();
      headers.append('Cache-Control', 'no-cache');
      headers.append('x-operation-id', operationId);
      const timestamp = Date.now();
      const url = `/api/history?t=${timestamp}&auth_ready=true`;

      edgeLogger.info('fetchHistoryFromAPI: Making GET request', { // Changed to info
        category: 'chat',
        operationId,
        url
      });

      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        cache: 'no-store',
        signal: abortController.signal,
        mode: 'same-origin'
      });
      clearTimeout(abortTimeout);
      const apiDuration = Date.now() - fetchStartTime;

      edgeLogger.debug(`fetchHistoryFromAPI: Response status: ${response.status}`, { category: 'chat', operationId, status: response.status, durationMs: apiDuration });

      // --> ADD RAW RESPONSE LOGGING <--
      const rawText = await response.text(); // Get raw text BEFORE checking ok status
      edgeLogger.debug('fetchHistoryFromAPI: Raw API response text', {
        category: 'chat',
        operationId,
        status: response.status,
        length: rawText.length,
        sample: rawText.substring(0, 200) + (rawText.length > 200 ? '...' : '')
      });
      // --> END RAW RESPONSE LOGGING <--

      if (!response.ok) {
        // ... existing error handling ...
        throw new Error(`History API failed with status ${response.status}: ${response.statusText}`);
      }

      let data;
      try {
        const parsedResponse = JSON.parse(rawText); // Parse the raw text

        // Handle both formats: direct array or {success: true, data: [...]}
        if (parsedResponse && typeof parsedResponse === 'object' && 'data' in parsedResponse && Array.isArray(parsedResponse.data)) {
          // New format with success wrapper
          data = parsedResponse.data;
        } else if (Array.isArray(parsedResponse)) {
          // Old direct array format
          data = parsedResponse;
        } else {
          // Invalid format
          edgeLogger.error('[HistoryService] Invalid response format', {
            type: typeof parsedResponse,
            isArray: Array.isArray(parsedResponse),
            operationId
          });
          throw new Error('Invalid history API response format');
        }

        if (data.length > 0) {
          const cacheTTL = CACHE_TTL;
          edgeLogger.info(`Setting cache for history (${cacheKey})`, { category: LOG_CATEGORIES.SYSTEM /* Temp */, operationId, count: data.length, ttl: cacheTTL }); // Changed to info
          clientCache.set(cacheKey, data, cacheTTL);
          // ... 
        } else {
          edgeLogger.info(`Fetched empty history (${cacheKey})`, { category: 'chat', operationId, status: response.status }); // Changed to info
          clientCache.set(cacheKey, [], Math.min(CACHE_TTL, 60 * 1000));
        }

        edgeLogger.info('fetchHistoryFromAPI completed successfully', { category: 'chat', operationId, count: data.length, durationMs: apiDuration }); // Changed to info
        return data;
      } catch (e) {
        // ... existing JSON parse error handling ...
        throw e;
      }
    } catch (error) {
      // ... existing outer error handling ...
      throw error; // Re-throw error for circuit breaker
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
   * Invalidate the history cache
   */
  invalidateCache(): void {
    clientCache.remove(HISTORY_CACHE_KEY);
    edgeLogger.debug('History cache invalidated', { category: 'auth' });
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