/**
 * Simple client-side cache utility for reducing redundant API calls
 * with support for persistent and session-based caching
 */
export const clientCache = {
  sessionStorage: typeof window !== 'undefined' ? window.sessionStorage : null,
  localStorage: typeof window !== 'undefined' ? window.localStorage : null,
  
  // Default to session storage for backward compatibility
  storage: typeof window !== 'undefined' ? window.sessionStorage : null,
  
  /**
   * Determine if a key should use persistent storage (localStorage)
   * Critical keys like auth state should be persistent
   */
  shouldUsePersistentStorage(key: string): boolean {
    const persistentKeys = [
      'global_auth_failure',
      'auth_failure_count',
      'auth_failure_last_time',
      'auth_backoff_duration'
    ];
    
    return persistentKeys.includes(key) || key.startsWith('auth_');
  },
  
  /**
   * Get the appropriate storage for a key
   */
  getStorageForKey(key: string): Storage | null {
    if (!this.sessionStorage || !this.localStorage) return null;
    
    return this.shouldUsePersistentStorage(key) 
      ? this.localStorage 
      : this.sessionStorage;
  },
  
  /**
   * Get item from cache with TTL check
   * @param key Cache key
   * @param ttlMs Default TTL in milliseconds
   * @param forcePersistent Force using localStorage even for non-persistent keys
   */
  get(key: string, ttlMs: number = 30000, forcePersistent = false): any {
    const storage = forcePersistent ? this.localStorage : this.getStorageForKey(key);
    if (!storage) return null;
    
    try {
      const item = storage.getItem(key);
      const timestamp = storage.getItem(`${key}_timestamp`);
      const customTtl = storage.getItem(`${key}_ttl`);
      
      if (!item || !timestamp) return null;
      
      // Check if cache is still valid
      const now = Date.now();
      // Use custom TTL if available, otherwise use the passed ttlMs
      const actualTtl = customTtl ? parseInt(customTtl) : ttlMs;
      
      if (now - parseInt(timestamp) > actualTtl) {
        this.remove(key);
        return null;
      }
      
      return JSON.parse(item);
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  },
  
  /**
   * Set item in cache with timestamp
   * @param key Cache key
   * @param value Value to store
   * @param ttlMs Optional TTL in milliseconds (stored with the item)
   * @param forcePersistent Force using localStorage even for non-persistent keys
   */
  set(key: string, value: any, ttlMs?: number, forcePersistent = false): void {
    const storage = forcePersistent ? this.localStorage : this.getStorageForKey(key);
    if (!storage) return;
    
    try {
      storage.setItem(key, JSON.stringify(value));
      storage.setItem(`${key}_timestamp`, Date.now().toString());
      
      // Store custom TTL if provided
      if (ttlMs) {
        storage.setItem(`${key}_ttl`, ttlMs.toString());
      } else {
        // Remove any existing TTL
        storage.removeItem(`${key}_ttl`);
      }
    } catch (error) {
      console.error('Cache storage error:', error);
      
      // If storage is full, try to clear old items
      if (error instanceof DOMException && 
          (error.name === 'QuotaExceededError' || 
           error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        try {
          this.clearOldItems(storage);
          // Try again
          storage.setItem(key, JSON.stringify(value));
          storage.setItem(`${key}_timestamp`, Date.now().toString());
          if (ttlMs) {
            storage.setItem(`${key}_ttl`, ttlMs.toString());
          }
        } catch (retryError) {
          console.error('Cache retry failed after clearing old items:', retryError);
        }
      }
    }
  },
  
  /**
   * Remove item from cache
   * @param key Cache key
   * @param forcePersistent Force using localStorage even for non-persistent keys
   */
  remove(key: string, forcePersistent = false): void {
    const storage = forcePersistent ? this.localStorage : this.getStorageForKey(key);
    if (!storage) return;
    
    try {
      storage.removeItem(key);
      storage.removeItem(`${key}_timestamp`);
      storage.removeItem(`${key}_ttl`);
    } catch (error) {
      console.error('Cache removal error:', error);
    }
  },
  
  /**
   * Clear old items from storage to free up space
   * @param storage The storage object to clean
   */
  clearOldItems(storage: Storage): void {
    try {
      // Get all keys
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && !key.endsWith('_timestamp') && !key.endsWith('_ttl')) {
          keys.push(key);
        }
      }
      
      // Sort by timestamp (oldest first)
      keys.sort((a, b) => {
        const aTime = storage.getItem(`${a}_timestamp`);
        const bTime = storage.getItem(`${b}_timestamp`);
        
        if (!aTime) return -1;
        if (!bTime) return 1;
        
        return parseInt(aTime) - parseInt(bTime);
      });
      
      // Remove oldest 50% of items
      const itemsToRemove = Math.ceil(keys.length / 2);
      for (let i = 0; i < itemsToRemove; i++) {
        if (i < keys.length) {
          this.remove(keys[i]);
        }
      }
      
      console.log(`Cleared ${itemsToRemove} old items from cache`);
    } catch (error) {
      console.error('Error cleaning cache:', error);
    }
  },
  
  /**
   * Get all cache keys
   */
  getAllKeys(): string[] {
    const keys: string[] = [];
    
    try {
      if (this.sessionStorage) {
        for (let i = 0; i < this.sessionStorage.length; i++) {
          const key = this.sessionStorage.key(i);
          if (key && !key.endsWith('_timestamp') && !key.endsWith('_ttl')) {
            keys.push(key);
          }
        }
      }
      
      if (this.localStorage) {
        for (let i = 0; i < this.localStorage.length; i++) {
          const key = this.localStorage.key(i);
          if (key && !key.endsWith('_timestamp') && !key.endsWith('_ttl') && !keys.includes(key)) {
            keys.push(key);
          }
        }
      }
    } catch (error) {
      console.error('Error getting cache keys:', error);
    }
    
    return keys;
  }
}; 