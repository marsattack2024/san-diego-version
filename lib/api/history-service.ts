import { clientCache } from '@/lib/cache/client-cache';
import { Chat } from '@/lib/db/schema';

/**
 * Optimized service for fetching chat history with client-side caching
 */
export const historyService = {
  /**
   * Fetch chat history with caching
   * @param userId Optional user ID for cache key uniqueness
   * @param ttlMs Cache TTL in milliseconds (defaults to 30 seconds)
   */
  async fetchHistory(userId?: string, ttlMs: number = 30000): Promise<Chat[]> {
    // Create a cache key that's unique to the user
    const cacheKey = userId ? `chat_history_${userId}` : 'chat_history';
    
    // Try to get from cache first
    const cached = clientCache.get(cacheKey, ttlMs);
    if (cached) {
      console.log('Using cached chat history');
      return cached;
    }
    
    // Cache miss - fetch from API
    try {
      console.log('Fetching fresh chat history from API');
      const response = await fetch('/api/history');
      
      if (!response.ok) {
        throw new Error(`History fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store in cache
      clientCache.set(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      // Return empty array to prevent UI errors
      return [];
    }
  },
  
  /**
   * Delete a chat and update cache
   */
  async deleteChat(chatId: string, userId?: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/history?id=${chatId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }
      
      // Invalidate the chat history cache to force refresh
      const cacheKey = userId ? `chat_history_${userId}` : 'chat_history';
      clientCache.remove(cacheKey);
      
      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      return false;
    }
  },
  
  /**
   * Invalidate chat history cache
   */
  invalidateCache(userId?: string): void {
    const cacheKey = userId ? `chat_history_${userId}` : 'chat_history';
    clientCache.remove(cacheKey);
  }
}; 