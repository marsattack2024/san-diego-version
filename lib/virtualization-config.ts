/**
 * Virtualization configuration for chat components
 * Centralizes settings for virtualized lists to ensure consistent behavior
 */

// Constants for virtualization
export const BOTTOM_THRESHOLD = 200; // Increased threshold in pixels to consider "near bottom"
export const DEFAULT_ITEM_HEIGHT = 90; // Increased default height for virtualized items 
export const OVERSCAN_COUNT = 10; // Increased number of items to render outside of the visible area

/**
 * Configuration object for Virtuoso component
 */
export const virtuosoConfig = {
    // Style settings
    style: {
        height: '100%',
        width: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
    },

    // Default CSS classes - using token system 
    className: 'flex flex-col min-w-0 gap-2 flex-1 h-full pt-4 pb-1',

    // Scroll behavior settings
    followOutput: 'auto',
    alignToBottom: true,

    // Item sizing configuration
    defaultItemHeight: DEFAULT_ITEM_HEIGHT,

    // Scrolling threshold settings
    atBottomThreshold: BOTTOM_THRESHOLD,

    // Initial configuration 
    initialTopMostItemIndex: -1, // Will be set to messages.length - 1
};

/**
 * Configuration for message containers within virtualized lists
 */
export const messageVirtualConfig = {
    // Base container styling
    containerClass: 'w-full mx-auto max-w-3xl px-4 md:px-6 group/message mb-2',

    // Animation settings
    initial: { y: 5, opacity: 0 },
    animate: { y: 0, opacity: 1 },

    // Layout configuration
    flexClass: 'flex gap-2 w-full',
    contentClass: 'flex flex-col gap-1 w-full',

    // Message bubble styling by role
    bubbleClass: {
        user: 'bg-black text-white px-4 py-2 rounded-xl shadow-sm',
        assistant: 'px-4 py-2 rounded-xl'
    }
};

/**
 * Configuration for input container in chat interface
 */
export const inputConfig = {
    // Container styling
    containerClass: 'sticky inset-x-0 bottom-0 z-10 w-full bg-gradient-to-t from-background via-background to-transparent pb-2 pt-1 md:pb-3',

    // Form styling
    formClass: 'mx-auto flex max-w-3xl flex-col gap-2 bg-background pt-0 pb-2 px-2 md:px-0',
};

/**
 * Utility function to get proper scrolling configuration based on state
 */
export function getScrollConfig(isStreaming: boolean, shouldAutoScroll: boolean) {
    return {
        followOutput: shouldAutoScroll ? 'auto' : false,
        overscan: shouldAutoScroll && isStreaming ? 250 : OVERSCAN_COUNT, // Higher overscan during streaming
    };
} 