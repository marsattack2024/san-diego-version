/**
 * In-memory authentication cache to reduce redundant auth checks
 */
export const authCache = {
  user: null as any,
  timestamp: 0,
  
  /**
   * Check if cached user is still valid (within TTL)
   */
  isValid(ttlMs: number = 60000): boolean {
    return (
      !!this.user && 
      this.timestamp > 0 && 
      (Date.now() - this.timestamp < ttlMs)
    );
  },
  
  /**
   * Store user in cache
   */
  set(user: any): void {
    this.user = user;
    this.timestamp = Date.now();
  },
  
  /**
   * Get cached user if valid, otherwise null
   */
  get(ttlMs: number = 60000): any {
    return this.isValid(ttlMs) ? this.user : null;
  },
  
  /**
   * Clear the cache
   */
  clear(): void {
    this.user = null;
    this.timestamp = 0;
  }
}; 