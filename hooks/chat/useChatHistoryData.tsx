import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { groupChatsByDate, type GroupedChats } from '@/lib/utils/date-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { shallow } from 'zustand/shallow';

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const POLLING_JITTER_MS = 30 * 1000; // 30 seconds

export function useChatHistoryData() {
    const isComponentMounted = useRef(true);

    // Select relevant state from stores
    const { conversationsIndex, isLoadingHistory, historyError, fetchHistory } = useChatStore(
        (state) => ({
            conversationsIndex: state.conversationsIndex,
            isLoadingHistory: state.isLoadingHistory,
            historyError: state.historyError,
            fetchHistory: state.fetchHistory,
        }),
        shallow // Use shallow comparison
    );
    const { isAuthenticated } = useAuthStore(
        (state) => ({ isAuthenticated: state.isAuthenticated })
    );

    // --- Initial Fetch Logic ---
    useEffect(() => {
        // Attempt initial fetch only if authenticated, not loading, and index is empty
        if (isAuthenticated && !isLoadingHistory && Object.keys(conversationsIndex).length === 0) {
            edgeLogger.debug('[useChatHistoryData] Attempting initial history fetch', {
                category: LOG_CATEGORIES.CHAT,
                trigger: 'mount/auth_ready',
            });
            fetchHistory(false).catch(error => {
                // Error is handled by the historyError state, log here for trace
                edgeLogger.error('[useChatHistoryData] Initial fetchHistory call failed', {
                    category: LOG_CATEGORIES.CHAT,
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        }
    }, [isAuthenticated, isLoadingHistory, fetchHistory, conversationsIndex]); // Added conversationsIndex dependency

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
                state.fetchHistory(false).catch(error => {
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
    }, [isAuthenticated]); // Only depends on auth state to start/stop polling

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
            // If there was a running poll from a previous auth state, cleanup
            // (This part might be redundant if setupPolling handles the !isAuthenticated case correctly,
            // but explicit cleanup on auth loss is safer)
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
    const groupedChats = useMemo<GroupedChats>(() => {
        // Convert index map to array for grouping
        const historyArray = Object.values(conversationsIndex).map(metadata => ({
            id: metadata.id,
            title: metadata.title || 'New Chat',
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt || metadata.createdAt, // Ensure updatedAt has a fallback
            userId: metadata.userId || '',
            messages: [], // Messages not needed for sidebar display
            agentId: metadata.agentId,
            deepSearchEnabled: metadata.deepSearchEnabled
            // Cast to Chat - needs careful type alignment or a dedicated SidebarChat type
        } as any)); // Use 'any' for now, refine type later

        edgeLogger.debug('[useChatHistoryData] Grouping chats', {
            category: LOG_CATEGORIES.CHAT,
            count: historyArray.length
        });
        return groupChatsByDate(historyArray);
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
        }).catch(error => {
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