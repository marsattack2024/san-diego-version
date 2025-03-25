import { clientCache } from '@/lib/cache/client-cache';
import { Chat } from '@/lib/db/schema';
import { randomUUID } from 'crypto';

// Keep track of pending requests to deduplicate
const pendingRequests: Record<string, Promise<Chat[]> | null> = {};

// Track last refresh time
let lastRefreshTime = 0;
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes (increased from 60 seconds)
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache TTL (increased from 2 minutes)

/**
 * History service provides methods for fetching and managing chat history
 * with client-side caching and improved error handling.
 */
export const historyService = {
  /**
   * Fetch chat history with client-side caching
   * @param forceRefresh Whether to force a refresh from API
   * @returns Array of chat objects
   */
  async fetchHistory(forceRefresh = false): Promise<Chat[]> {
    const startTime = performance.now();
    const operationId = Math.random().toString(36).substring(2, 10);
    
    try {
      // Create a unique cache key based on user
      const cacheKey = 'chat_history';
      
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
      
      // Check if we're in an auth failure cooldown period
      try {
        const isAuthFailed = clientCache.get(`${cacheKey}_auth_failed`);
        if (isAuthFailed && !forceRefresh) {
          console.log(`[History:${operationId}] In auth failure cooldown, returning empty history`);
          return [];
        }
      } catch (e) {
        // Ignore cache errors
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
   * Private method to fetch history from API and cache it
   */
  async fetchHistoryFromAPI(cacheKey: string, operationId: string): Promise<Chat[]> {
    const startTime = performance.now();
    console.log(`[History:${operationId}] Starting API fetch for chat history`);
    
    try {
      // Add timeout to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased from 10)
      
      const response = await fetch('/api/history', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      });
      
      // Clear timeout once we have a response
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Could not read error text');
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          errorText
        };
        
        // Special handling for authentication errors (401)
        if (response.status === 401) {
          console.warn(`[History:${operationId}] Authentication error: Not logged in or session expired`);
          
          // Cache an empty array for a longer period to prevent constant retries
          // This creates a "cooling off" period for auth-failed requests
          const FAILED_AUTH_CACHE_TTL = 30000; // 30 seconds (much longer than regular retries)
          try {
            // Cache empty array but with a special flag to indicate auth failure
            clientCache.set(cacheKey, [], FAILED_AUTH_CACHE_TTL);
            clientCache.set(`${cacheKey}_auth_failed`, true, FAILED_AUTH_CACHE_TTL);
            console.log(`[History:${operationId}] Cached auth failure state for ${FAILED_AUTH_CACHE_TTL/1000}s to prevent constant retries`);
          } catch (cacheError) {
            console.warn(`[History:${operationId}] Failed to cache auth failure state:`, cacheError);
          }
          
          // Return empty array - app should handle gracefully
          return [];
        }
        
        console.error(`[History:${operationId}] API returned error status ${response.status}`, errorDetails);
        throw new Error(`API returned status ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      const duration = Math.round(performance.now() - startTime);
      
      console.log(`[History:${operationId}] Successfully fetched history from API`, {
        status: response.status,
        duration,
        count: data.length,
        firstChatId: data.length > 0 ? data[0].id.slice(0, 8) : null,
        chatIds: data.length > 0 ? data.slice(0, 3).map((c: Chat) => c.id.slice(0, 8)) : []
      });
      
      // Clear any previous auth failure flag
      try {
        clientCache.set(`${cacheKey}_auth_failed`, false);
      } catch (e) {
        // Ignore
      }
      
      // Cache the result for future use
      try {
        clientCache.set(cacheKey, data);
        console.log(`[History:${operationId}] Chat history cached (${data.length} items)`);
      } catch (cacheError) {
        console.warn(`[History:${operationId}] Failed to cache chat history:`, cacheError);
      }
      
      return data;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      
      console.error(`[History:${operationId}] ${isAbort ? 'Fetch timed out' : 'API error'}:`, {
        error,
        duration,
        isTimeout: isAbort,
        message: error instanceof Error ? error.message : String(error)
      });
      
      // Rethrow with a clearer message for debugging
      throw new Error(`Failed to fetch chat history: ${isAbort ? 'Request timed out' : error instanceof Error ? error.message : String(error)}`);
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