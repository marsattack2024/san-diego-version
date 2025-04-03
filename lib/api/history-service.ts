/**
 * History Service - refactored to use dependency injection and RLS
 * This simplified version removes the complex circuit breaker pattern
 * and relies on Supabase RLS for data security.
 */

import { clientCache } from '@/lib/cache/client-cache';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Chat } from '@/lib/db/schema';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cache constants
const HISTORY_CACHE_KEY = 'chat_history';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache TTL

/**
 * History service for fetching and managing chat history
 * Uses dependency injection to accept Supabase client from the caller
 */
export const historyService = {
  /**
   * Fetch chat history for the current user
   * @param supabase - The Supabase client instance appropriate for the calling context
   * @param forceRefresh - Whether to bypass cache and force refresh
   * @returns Promise resolving to array of chats
   */
  async fetchHistory(supabase: SupabaseClient, forceRefresh = false): Promise<Chat[]> {
    const operationId = `history_${Date.now().toString(36).substring(2, 8)}`;
    const cacheKey = HISTORY_CACHE_KEY;

    // Return cached data if available and not forced refresh
    if (!forceRefresh) {
      try {
        const cachedData = clientCache.get(cacheKey) as Chat[] | undefined;
        if (cachedData && Array.isArray(cachedData)) {
          edgeLogger.debug('Using cached history data', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            count: cachedData.length
          });
          return cachedData;
        }
      } catch (e) {
        edgeLogger.debug('Cache miss or error', {
          category: LOG_CATEGORIES.SYSTEM,
          operationId
        });
      }
    }

    try {
      edgeLogger.debug('Fetching chat history', {
        category: LOG_CATEGORIES.CHAT,
        operationId
      });

      // Fetch sessions - RLS will automatically scope to the current user
      const { data: sessions, error } = await supabase
        .from('sd_chat_sessions')
        .select('id, title, created_at, updated_at, agent_id, user_id, deep_search_enabled')
        .order('updated_at', { ascending: false });

      if (error) {
        edgeLogger.error('Error fetching chat sessions', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          error: error.message
        });
        return []; // Return empty array on error
      }

      // Map to Chat objects
      const chats: Chat[] = (sessions || []).map(session => ({
        id: session.id,
        title: session.title || 'Untitled Chat',
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        userId: session.user_id,
        messages: [],
        agentId: session.agent_id || 'default',
        deepSearchEnabled: session.deep_search_enabled || false
      }));

      // Cache results
      clientCache.set(cacheKey, chats, CACHE_TTL);

      edgeLogger.debug('Successfully fetched chat history', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        count: chats.length
      });

      return chats;
    } catch (error) {
      edgeLogger.error('Error in fetchHistory', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty array rather than throwing
      return [];
    }
  },

  /**
   * Delete a chat by ID and update the cache
   * @param supabase - The Supabase client instance
   * @param id - Chat ID to delete
   * @returns Promise resolving to success status
   */
  async deleteChat(supabase: SupabaseClient, id: string): Promise<boolean> {
    const operationId = `delete_${Date.now().toString(36).substring(2, 8)}`;

    if (!id) {
      edgeLogger.error('Invalid chat ID for deletion', {
        category: LOG_CATEGORIES.CHAT,
        operationId
      });
      return false;
    }

    try {
      edgeLogger.debug('Deleting chat', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        chatId: id
      });

      // Delete the chat using Supabase
      const { error } = await supabase
        .from('sd_chat_sessions')
        .delete()
        .eq('id', id);

      if (error) {
        edgeLogger.error('Error deleting chat', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          chatId: id,
          error: error.message
        });
        return false;
      }

      // Update the cache by removing the deleted chat
      try {
        const cachedData = clientCache.get(HISTORY_CACHE_KEY) as Chat[] | undefined;
        if (cachedData && Array.isArray(cachedData)) {
          const updatedData = cachedData.filter(chat => chat.id !== id);
          clientCache.set(HISTORY_CACHE_KEY, updatedData, CACHE_TTL);

          edgeLogger.debug('Updated cache after deletion', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            count: updatedData.length
          });
        }
      } catch (cacheError) {
        edgeLogger.warn('Error updating cache after deletion', {
          category: LOG_CATEGORIES.SYSTEM,
          operationId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError)
        });
      }

      edgeLogger.info('Successfully deleted chat', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        chatId: id
      });

      return true;
    } catch (error) {
      edgeLogger.error('Error deleting chat', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        chatId: id,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },

  /**
   * Create a new chat session
   * @param supabase - The Supabase client instance
   * @returns Promise resolving to an object with id, success, and optional error
   */
  async createNewSession(supabase: SupabaseClient): Promise<{ id: string; success: boolean; error?: string }> {
    const operationId = `create_session_${Date.now().toString(36).substring(2, 8)}`;
    const id = crypto.randomUUID();

    try {
      edgeLogger.debug('Creating new chat session', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        sessionId: id
      });

      // Get the current authenticated user (RLS will validate)
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        edgeLogger.error('Authentication error creating session', {
          category: LOG_CATEGORIES.AUTH,
          operationId,
          error: authError?.message || 'No authenticated user'
        });
        return { id, success: false, error: 'Authentication required' };
      }

      // Insert the new session
      const { error } = await supabase
        .from('sd_chat_sessions')
        .insert({
          id,
          title: 'New Chat',
          user_id: user.id,
          agent_id: 'default',
          deep_search_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        edgeLogger.error('Error creating chat session', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          sessionId: id,
          error: error.message
        });
        return { id, success: false, error: error.message };
      }

      // Invalidate cache to ensure new session appears
      this.invalidateCache();

      edgeLogger.info('Successfully created chat session', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        sessionId: id
      });

      return { id, success: true };
    } catch (error) {
      edgeLogger.error('Unexpected error creating chat session', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        sessionId: id,
        error: error instanceof Error ? error.message : String(error)
      });
      return { id, success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  /**
   * Rename a chat session
   * @param supabase - The Supabase client instance
   * @param chatId - ID of the chat to rename
   * @param title - New title for the chat
   * @returns Promise resolving to success status
   */
  async renameChat(supabase: SupabaseClient, chatId: string, title: string): Promise<boolean> {
    const operationId = `rename_${Date.now().toString(36).substring(2, 8)}`;

    if (!chatId || !title.trim()) {
      edgeLogger.error('Invalid chat ID or title for rename', {
        category: LOG_CATEGORIES.CHAT,
        operationId
      });
      return false;
    }

    try {
      edgeLogger.debug('Renaming chat', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        chatId,
        title
      });

      // Update the chat title using Supabase
      const { error } = await supabase
        .from('sd_chat_sessions')
        .update({ title })
        .eq('id', chatId);

      if (error) {
        edgeLogger.error('Error renaming chat', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          chatId,
          title,
          error: error.message
        });
        return false;
      }

      // Update the cache with the new title
      try {
        const cachedData = clientCache.get(HISTORY_CACHE_KEY) as Chat[] | undefined;
        if (cachedData && Array.isArray(cachedData)) {
          const updatedData = cachedData.map(chat =>
            chat.id === chatId ? { ...chat, title } : chat
          );
          clientCache.set(HISTORY_CACHE_KEY, updatedData, CACHE_TTL);

          edgeLogger.debug('Updated cache after rename', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId
          });
        }
      } catch (cacheError) {
        edgeLogger.warn('Error updating cache after rename', {
          category: LOG_CATEGORIES.SYSTEM,
          operationId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError)
        });
      }

      edgeLogger.info('Successfully renamed chat', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        chatId,
        title
      });

      return true;
    } catch (error) {
      edgeLogger.error('Error renaming chat', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        chatId,
        title,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },

  /**
   * Invalidate the history cache
   */
  invalidateCache(): void {
    try {
      clientCache.remove(HISTORY_CACHE_KEY);
      edgeLogger.debug('Invalidated history cache', {
        category: LOG_CATEGORIES.SYSTEM
      });
    } catch (error) {
      edgeLogger.warn('Error invalidating history cache', {
        category: LOG_CATEGORIES.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}; 