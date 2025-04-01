'use client';

import { useEffect, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { toast } from 'sonner';

type DeepSearchEvent = {
  type: 'deepSearch';
  status: 'started' | 'completed' | 'failed';
  details?: string;
};

/**
 * Helper function to extract the Supabase auth token from cookies
 */
function getSupabaseToken(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const authCookie = cookies.find(cookie =>
    cookie.trim().startsWith('sb-') &&
    cookie.includes('-auth-token='));

  if (!authCookie) return null;

  // Extract just the token value
  const tokenParts = authCookie.split('=');
  if (tokenParts.length !== 2) return null;

  return tokenParts[1].trim();
}

/**
 * This component listens for deep search events from the server
 * and updates the chat store accordingly.
 */
export function DeepSearchTracker() {
  const setDeepSearchInProgress = useChatStore(state => state.setDeepSearchInProgress);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    // In development mode, simulate a successful connection without actually connecting
    if (process.env.NODE_ENV === 'development') {
      console.info('[DeepSearchTracker] Development mode - using simulated connection');
      return () => { };
    }

    let eventSource: EventSource | null = null;
    let isUnmounting = false;

    // Function to create and set up the EventSource with proper error handling
    const setupEventSource = () => {
      if (isUnmounting) return;

      try {
        // Get the auth token to include in the request
        const authToken = getSupabaseToken();

        // No auth token? Don't even try to connect but don't throw error
        if (!authToken) {
          console.warn('[DeepSearchTracker] No auth token found, skipping event connection');
          return;
        }

        // Create URL with auth token as query parameter
        const eventSourceUrl = `/api/events?auth=${encodeURIComponent(authToken)}`;

        // Create an event source with timeout protection
        const abortController = new AbortController();

        // Set a hard timeout to prevent UI freezing
        const timeoutId = setTimeout(() => {
          console.warn('[DeepSearchTracker] Connection timeout, aborting');
          abortController.abort();
        }, 3000);

        // Create EventSource with proper error handling
        eventSource = new EventSource(eventSourceUrl);

        // Clear timeout on success or error
        const clearConnectionTimeout = () => {
          clearTimeout(timeoutId);
        };

        // Listen for deep search status events
        eventSource.addEventListener('message', (event) => {
          clearConnectionTimeout();

          try {
            const data = JSON.parse(event.data) as DeepSearchEvent;

            // Only process deep search events
            if (data.type === 'deepSearch') {
              console.info(`[DeepSearchTracker] Event received: ${data.status}`);

              if (data.status === 'started') {
                setDeepSearchInProgress(true);
              } else if (data.status === 'completed' || data.status === 'failed') {
                setDeepSearchInProgress(false);
              }
            }
          } catch (error) {
            console.error('[DeepSearchTracker] Error processing event:', error);
          }
        });

        // Handle connection open
        eventSource.onopen = () => {
          console.info('[DeepSearchTracker] Connection established');
          clearConnectionTimeout();
        };

        // Handle errors gracefully - just log and don't try to reconnect
        eventSource.onerror = () => {
          console.warn('[DeepSearchTracker] Connection error - not retrying');
          clearConnectionTimeout();
          eventSource?.close();
        };

      } catch (error) {
        console.error('[DeepSearchTracker] Error setting up EventSource:', error);
        // Fail silently to prevent UI issues
      }
    };

    // Initial setup with delay to avoid auth races
    const timerId = setTimeout(() => {
      if (!isUnmounting) {
        setupEventSource();
      }
    }, 2000);

    // Clean up on unmount
    return () => {
      isUnmounting = true;
      clearTimeout(timerId);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [setDeepSearchInProgress, initialized]);

  // This component doesn't render anything visible
  return null;
}