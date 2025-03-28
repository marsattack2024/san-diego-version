'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';

type DeepSearchEvent = {
  type: 'deepSearch';
  status: 'started' | 'completed' | 'failed';
  details?: string;
};

/**
 * This component listens for deep search events from the server
 * and updates the chat store accordingly.
 */
export function DeepSearchTracker() {
  const setDeepSearchInProgress = useChatStore(state => state.setDeepSearchInProgress);

  useEffect(() => {
    // Create an event source for server-sent events
    // The URL will be intercepted by the middleware to add credentials
    const eventSource = new EventSource('/api/events');

    // Listen for deep search status events
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data) as DeepSearchEvent;

        // Only process deep search events
        if (data.type === 'deepSearch') {
          // Log all Deep Search events for debugging
          console.info(`[DeepSearchTracker] Event received: ${data.status}`, {
            status: data.status,
            details: data.details,
            timestamp: new Date().toISOString(),
            deepSearchEnabled: useChatStore.getState().deepSearchEnabled
          });

          if (data.status === 'started') {
            // Deep search has started
            setDeepSearchInProgress(true);
            console.log('Deep search started');
          } else if (data.status === 'completed' || data.status === 'failed') {
            // Deep search has ended (either completed or failed)
            setDeepSearchInProgress(false);
            console.log(`Deep search ${data.status}${data.details ? ': ' + data.details : ''}`);
          }
        }
      } catch (error) {
        console.error('Error processing event:', error);
      }
    });

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      // Don't set deep search to false on connection errors
      // as we don't know the actual state
    };

    // Clean up the event source on unmount
    return () => {
      eventSource.close();
    };
  }, [setDeepSearchInProgress]);

  // This component doesn't render anything
  return null;
}