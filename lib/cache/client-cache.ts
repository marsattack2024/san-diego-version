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
      
      if (!item || !timestamp) return null;
      
      // Check if cache is still valid
      const now = Date.now();
      if (now - parseInt(timestamp) > ttlMs) {
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
   */
  set(key: string, value: any): void {
    if (!this.storage) return;
    
    try {
      this.storage.setItem(key, JSON.stringify(value));
      this.storage.setItem(`${key}_timestamp`, Date.now().toString());
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
  }
}; 