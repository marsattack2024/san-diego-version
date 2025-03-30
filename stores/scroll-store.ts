import { create } from 'zustand';

type ScrollState = {
  isAtBottom: boolean;
  isStreaming: boolean;
  shouldAutoScroll: boolean;
  userHasScrolled: boolean;
  setIsAtBottom: (isAtBottom: boolean) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  setShouldAutoScroll: (shouldAutoScroll: boolean) => void;
  setUserHasScrolled: (userHasScrolled: boolean) => void;
  // Added action to handle auto-scroll logic in one place
  handleScrollPositionChange: (isAtBottom: boolean) => void;
  // Reset auto-scroll when user sends a message
  resetOnUserMessage: () => void;
};

export const useScrollStore = create<ScrollState>((set, get) => ({
  isAtBottom: true,
  isStreaming: false,
  shouldAutoScroll: true,
  userHasScrolled: false,
  setIsAtBottom: (isAtBottom) => set({ isAtBottom }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setShouldAutoScroll: (shouldAutoScroll) => set({ shouldAutoScroll }),
  setUserHasScrolled: (userHasScrolled) => set({ userHasScrolled }),
  
  // Comprehensive handler for scroll position changes
  handleScrollPositionChange: (isAtBottom) => {
    const { userHasScrolled } = get();
    
    set({ isAtBottom });
    
    // If user scrolled away from bottom, disable auto-scroll
    if (!isAtBottom && !userHasScrolled) {
      set({ 
        shouldAutoScroll: false,
        userHasScrolled: true 
      });
    }
    
    // If user manually scrolled back to bottom, re-enable auto-scroll
    if (isAtBottom && userHasScrolled) {
      set({ 
        shouldAutoScroll: true,
        userHasScrolled: false
      });
    }
  },
  
  // Call this when user sends a message to force scroll to bottom
  resetOnUserMessage: () => {
    set({ 
      shouldAutoScroll: true,
      userHasScrolled: false
    });
  }
}));