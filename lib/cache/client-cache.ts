/**
 * Simple client-side cache utility for reducing redundant API calls
 */
export const clientCache = {
  storage: typeof window !== 'undefined' ? window.sessionStorage : null,
  
  /**
   * Get item from cache with TTL check
   */
  get(key: string, ttlMs: number = 30000): any {
    if (!this.storage) return null;
    
    try {
      const item = this.storage.getItem(key);
      const timestamp = this.storage.getItem(`${key}_timestamp`);
      const customTtl = this.storage.getItem(`${key}_ttl`);
      
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
   */
  set(key: string, value: any, ttlMs?: number): void {
    if (!this.storage) return;
    
    try {
      this.storage.setItem(key, JSON.stringify(value));
      this.storage.setItem(`${key}_timestamp`, Date.now().toString());
      
      // Store custom TTL if provided
      if (ttlMs) {
        this.storage.setItem(`${key}_ttl`, ttlMs.toString());
      } else {
        // Remove any existing TTL
        this.storage.removeItem(`${key}_ttl`);
      }
    } catch (error) {
      console.error('Cache storage error:', error);
    }
  },
  
  /**
   * Remove item from cache
   */
  remove(key: string): void {
    if (!this.storage) return;
    
    this.storage.removeItem(key);
    this.storage.removeItem(`${key}_timestamp`);
    this.storage.removeItem(`${key}_ttl`);
  }
}; 