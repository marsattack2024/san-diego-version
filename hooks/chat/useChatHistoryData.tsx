import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChatStore, type ChatState, type ConversationMetadata } from '@/stores/chat-store';
import { useAuthStore, type AuthState } from '@/stores/auth-store';
import { groupChatsByDate, type GroupedChats } from '@/lib/utils/date-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import type { Chat } from '@/lib/db/schema';
import type { AgentType } from '@/lib/chat-engine/prompts';

// Define and EXPORT a type specific to the data needed by the sidebar items
export interface SidebarChatItem {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    userId?: string;
    agentId: AgentType;
    deepSearchEnabled?: boolean;
}

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const POLLING_JITTER_MS = 30 * 1000; // 30 seconds

export function useChatHistoryData() {
    const isComponentMounted = useRef(true);

    // Select relevant state from stores with explicit types
    const { conversationsIndex, isLoadingHistory, historyError, fetchHistory } = useChatStore(
        (state: ChatState) => ({
            conversationsIndex: state.conversationsIndex,
            isLoadingHistory: state.isLoadingHistory,
            historyError: state.historyError,
            fetchHistory: state.fetchHistory,
        })
        // Removed shallow comparator
    );
    const { isAuthenticated } = useAuthStore(
        (state: AuthState) => ({ isAuthenticated: state.isAuthenticated })
    );

    // --- Initial Fetch Logic ---
    useEffect(() => {
        // Attempt initial fetch only if authenticated, not loading, and index is empty
        if (isAuthenticated && !isLoadingHistory && Object.keys(conversationsIndex).length === 0) {
            edgeLogger.debug('[useChatHistoryData] Attempting initial history fetch', {
                category: LOG_CATEGORIES.CHAT,
                trigger: 'mount/auth_ready',
            });
            fetchHistory(false).catch((error: unknown) => { // Type error param
                // Error is handled by the historyError state, log here for trace
                edgeLogger.error('[useChatHistoryData] Initial fetchHistory call failed', {
                    category: LOG_CATEGORIES.CHAT,
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        }
    }, [isAuthenticated, isLoadingHistory, fetchHistory, conversationsIndex]);

    // --- Polling Logic ---
    const setupPolling = useCallback(() => {
        if (!isAuthenticated) {
            edgeLogger.debug('[useChatHistoryData] Polling skipped: not authenticated.', {
                category: LOG_CATEGORIES.CHAT
            });
            return; // Don't poll if not authenticated
        }

        const interval = POLLING_INTERVAL_MS + Math.floor(Math.random() * POLLING_JITTER_MS);
        edgeLogger.debug(`[useChatHistoryData] Setting up next history poll in ${Math.floor(interval / 1000)}s`, {
            category: LOG_CATEGORIES.CHAT
        });

        const timeoutId = setTimeout(() => {
            if (!isComponentMounted.current) return; // Check if component is still mounted

            // Check zustand state directly to avoid stale closures
            const state = useChatStore.getState();
            if (!state.isLoadingHistory) {
                edgeLogger.debug('[useChatHistoryData] Polling: fetching history', {
                    category: LOG_CATEGORIES.CHAT
                });
                state.fetchHistory(false).catch((error: unknown) => { // Type error param
                    edgeLogger.error('[useChatHistoryData] Polling fetchHistory call failed', {
                        category: LOG_CATEGORIES.CHAT,
                        error: error instanceof Error ? error.message : String(error)
                    });
                });
            } else {
                edgeLogger.debug('[useChatHistoryData] Polling: skipping fetch, already loading', {
                    category: LOG_CATEGORIES.CHAT
                });
            }

            // Setup the next poll if still mounted
            if (isComponentMounted.current) {
                setupPolling();
            }
        }, interval);

        // Return cleanup function
        return () => {
            clearTimeout(timeoutId);
            edgeLogger.debug('[useChatHistoryData] Polling cleanup function executed.', {
                category: LOG_CATEGORIES.CHAT
            });
        };
    }, [isAuthenticated, fetchHistory]); // Added fetchHistory dependency

    // Start/Stop polling based on authentication
    useEffect(() => {
        let cleanupPolling: (() => void) | undefined;
        if (isAuthenticated) {
            edgeLogger.debug('[useChatHistoryData] Auth detected, starting polling.', {
                category: LOG_CATEGORIES.CHAT
            });
            cleanupPolling = setupPolling();
        } else {
            edgeLogger.debug('[useChatHistoryData] No auth, ensuring polling is stopped.', {
                category: LOG_CATEGORIES.CHAT
            });
            // Explicitly call cleanup if polling might be running
            if (cleanupPolling) {
                cleanupPolling();
                cleanupPolling = undefined;
            }
        }

        // Cleanup polling on unmount or when auth changes
        return () => {
            if (cleanupPolling) {
                cleanupPolling();
            }
        };
    }, [isAuthenticated, setupPolling]);

    // --- Component Unmount Cleanup ---
    useEffect(() => {
        isComponentMounted.current = true;
        // Return cleanup function to set mounted flag to false
        return () => {
            isComponentMounted.current = false;
            edgeLogger.debug('[useChatHistoryData] Component unmounted.', {
                category: LOG_CATEGORIES.CHAT
            });
        };
    }, []);

    // --- Grouping Logic ---
    const groupedChats = useMemo<GroupedChats<SidebarChatItem>>(() => {
        // Explicitly type the array from Object.values
        const historyArray = (Object.values(conversationsIndex) as ConversationMetadata[])
            .map((metadata: ConversationMetadata): SidebarChatItem => ({
                id: metadata.id,
                title: metadata.title || 'New Chat',
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt || metadata.createdAt, // Ensure updatedAt has a fallback
                userId: metadata.userId,
                // Ensure agentId and deepSearchEnabled have fallbacks if they might be missing in metadata
                agentId: metadata.agentId || 'default',
                deepSearchEnabled: metadata.deepSearchEnabled || false,
            })); // No longer asserting as Chat or any

        edgeLogger.debug('[useChatHistoryData] Grouping chats', {
            category: LOG_CATEGORIES.CHAT,
            count: historyArray.length
        });
        // Call the generic function without casting
        return groupChatsByDate<SidebarChatItem>(historyArray);
    }, [conversationsIndex]);

    // --- Manual Refresh Function ---
    const refreshHistory = useCallback(() => {
        const startTime = performance.now();
        edgeLogger.info('[useChatHistoryData] Manual history refresh requested', {
            category: LOG_CATEGORIES.CHAT
        });
        fetchHistory(true).then(() => {
            const durationMs = performance.now() - startTime;
            edgeLogger.info('[useChatHistoryData] Manual history refresh completed', {
                category: LOG_CATEGORIES.CHAT,
                durationMs: Math.round(durationMs)
            });
        }).catch((error: unknown) => { // Type error param
            const durationMs = performance.now() - startTime;
            edgeLogger.error('[useChatHistoryData] Manual history refresh failed', {
                category: LOG_CATEGORIES.CHAT,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Math.round(durationMs),
                important: true
            });
            // Error state is handled by historyError, no need to duplicate UI update here
        });
    }, [fetchHistory]);

    // --- Return Value ---
    return {
        groupedChats,
        isLoading: isLoadingHistory,
        error: historyError,
        refreshHistory,
    };
} 