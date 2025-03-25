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

  // Set up mutation observer for content changes
  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      // Helper to check if user is already near the bottom
      const isNearBottom = () => {
        if (!container) return false;
        const { scrollTop, scrollHeight, clientHeight } = container;
        // Use a more generous threshold (250px)
        return scrollHeight - scrollTop - clientHeight < 250;
      };

      // Handle all scrolling needs
      const handleScrollToBottom = () => {
        // Only auto-scroll if already near bottom
        if (isNearBottom()) {
          // Use fastest behavior for consistency
          window.requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          });
        }
      };

      // Use a more performant mutation observer configuration
      const observer = new MutationObserver((mutations) => {
        // Check if the mutations are relevant for scrolling
        const hasRelevantChanges = mutations.some(mutation => 
          mutation.type === 'childList' || 
          (mutation.type === 'attributes' && 
           (mutation.target as HTMLElement).offsetHeight > 0)
        );

        if (hasRelevantChanges) {
          handleScrollToBottom();
        }
      });

      observer.observe(container, {
        childList: true,   // Watch for added/removed nodes
        subtree: true,     // Watch all descendants
        attributes: true,  // Watch attributes
        characterData: false, // Skip watching text changes for performance
      });

      // Set up event listeners for key events that might affect layout
      const events = ['resize', 'load', 'transitionend', 'animationend'];
      events.forEach(event => {
        window.addEventListener(event, handleScrollToBottom, { passive: true });
      });
      
      // Focus events can help with keyboard opening on mobile
      document.addEventListener('focus', handleScrollToBottom, { capture: true, passive: true });

      return () => {
        observer.disconnect();
        events.forEach(event => {
          window.removeEventListener(event, handleScrollToBottom);
        });
        document.removeEventListener('focus', handleScrollToBottom, { capture: true });
      };
    }
  }, []);

  return [containerRef, endRef];
}
