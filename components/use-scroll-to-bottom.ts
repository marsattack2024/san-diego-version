import { useEffect, useRef, useLayoutEffect, type RefObject } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);

  // Initial scroll with useLayoutEffect for priority rendering
  useLayoutEffect(() => {
    // Function to scroll container to the bottom
    const scrollToBottom = () => {
      const container = containerRef.current;
      if (!container) return;

      // Set scroll directly for immediate effect
      container.scrollTop = container.scrollHeight;
    };

    // Execute immediately
    scrollToBottom();

    // Also schedule with requestAnimationFrame for after paint
    requestAnimationFrame(scrollToBottom);
  }, []); // Only run once on initial mount

  // Effect to set up scrolling when messages change
  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (!container || !end) return;

    // Directly handle scrolling without conditions
    const handleScrollToBottom = () => {
      window.requestAnimationFrame(() => {
        if (container) {
          // Always scroll to bottom unconditionally
          container.scrollTop = container.scrollHeight;
        }
      });
    };

    // Make sure end element is always visible
    const scrollEndIntoView = () => {
      if (end) {
        end.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // Set up mutation observer for content changes
    const observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(mutation => 
        mutation.type === 'childList' || 
        (mutation.type === 'attributes' && 
         (mutation.target as HTMLElement).offsetHeight > 0)
      );

      if (hasRelevantChanges) {
        // Always scroll to bottom when content changes
        handleScrollToBottom();
        
        // Use scrollIntoView as a backup
        setTimeout(scrollEndIntoView, 100);
      }
    });

    observer.observe(container, {
      childList: true,   // Watch for added/removed nodes
      subtree: true,     // Watch all descendants
      attributes: true,  // Watch attributes
      characterData: false, // Skip watching text changes for performance
    });

    // Set up continuous scrolling during streaming
    // This mimics the behavior in the chat widget
    let scrollInterval: number | null = null;
    
    // Function to start streaming scroll behavior
    const startStreamingScroll = () => {
      // Clear any existing interval first
      if (scrollInterval) {
        clearInterval(scrollInterval);
      }
      
      // Set up new interval for continuous scrolling
      scrollInterval = window.setInterval(() => {
        handleScrollToBottom();
      }, 500); // Same 500ms interval as chat widget
    };
    
    // Listen for streaming state changes
    const streamObserver = new MutationObserver(() => {
      // Check if there's a thinking/loading element that indicates streaming
      const isStreaming = container.querySelector('.animate-pulse') !== null;
      
      if (isStreaming && !scrollInterval) {
        startStreamingScroll();
      } else if (!isStreaming && scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
        
        // Final scroll at end of streaming
        handleScrollToBottom();
        setTimeout(scrollEndIntoView, 100);
      }
    });
    
    streamObserver.observe(container, { childList: true, subtree: true });

    // Set up event listeners for key events that might affect layout
    const events = ['resize', 'load', 'transitionend', 'animationend'];
    events.forEach(event => {
      window.addEventListener(event, handleScrollToBottom, { passive: true });
    });
    
    // Focus events can help with keyboard opening on mobile
    document.addEventListener('focus', handleScrollToBottom, { capture: true, passive: true });

    return () => {
      observer.disconnect();
      streamObserver.disconnect();
      if (scrollInterval) {
        clearInterval(scrollInterval);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleScrollToBottom);
      });
      document.removeEventListener('focus', handleScrollToBottom, { capture: true });
    };
  }, []);

  return [containerRef, endRef];
}
