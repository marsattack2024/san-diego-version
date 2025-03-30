/**
 * Design token system for consistent UI styling
 * This file centralizes all spacing, typography, and UI constants
 */

/**
 * Spacing tokens for consistent layout across components
 */
export const spacing = {
    message: {
        // Space between adjacent messages
        verticalGap: 'mb-2',
        // Space between elements inside message
        internalGap: 'gap-2',
        // Content gap within message bubbles
        contentGap: 'gap-1.5',
        // Base padding for message bubbles
        padding: 'px-6 py-3.5',
        // Offset for action buttons relative to message
        actionOffset: 'mt-0 mb-0'
    },
    chat: {
        // Padding for the entire chat container
        containerPadding: 'pt-10 pb-2',
        // Spacing between input container and messages
        inputGap: 'pt-1 pb-3',
        // Spacing between input form elements
        formGap: 'gap-2'
    },
    virtualized: {
        // Default gap between virtualized list items
        itemGap: 'gap-4',
        // Default padding for virtualized containers
        containerPadding: 'pt-10 pb-1'
    }
};

/**
 * Typography tokens for consistent text styling
 */
export const typography = {
    // Line height for message content
    messageLineHeight: 'leading-relaxed',
    // Paragraph spacing in markdown content
    paragraphSpacing: 'my-3',
    // List item spacing in markdown content
    listItemSpacing: 'py-1.5',
    // List container spacing in markdown content
    listContainerSpacing: 'my-3',
    // Strong text styling - enhanced for better visibility
    strongText: 'font-extrabold text-primary',
    // Base message text size
    messageText: 'text-md'
};

/**
 * UI element styling tokens
 */
export const ui = {
    // Message action button styling
    actionButton: 'py-1.5 px-2.5 h-fit',
    // Message content container styling
    messageContainer: 'w-full mx-auto max-w-3xl px-4 md:px-6',
    // User message bubble styling
    userMessage: 'bg-black text-white rounded-xl shadow-sm px-6 py-2 mr-2',
    // Assistant message bubble styling
    assistantMessage: 'rounded-xl px-6 py-2',
    // Custom scrollbar styling
    scrollbar: 'scrollbar-thin custom-scrollbar'
};

/**
 * Markdown component style overrides
 */
export const markdown = {
    // Base markdown container styling
    container: 'prose-base max-w-none prose-p:my-3 prose-p:leading-relaxed',
    // List styling overrides
    lists: 'prose-li:my-1.5 prose-ol:my-3 prose-ul:my-3',
    // Heading styling overrides
    headings: 'prose-headings:my-3 prose-headings:font-bold',
    // Code styling overrides
    code: 'prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm',
};

/**
 * Combined style objects for direct component use
 */
export const styles = {
    // Message container styles
    messageContainer: `${ui.messageContainer} ${spacing.message.verticalGap} group/message`,
    // Message flex container styles
    messageFlex: `flex ${spacing.message.internalGap} w-full`,
    // Message content styles by role
    messageContent: {
        user: `${ui.userMessage}`,
        assistant: `${ui.assistantMessage} ${spacing.message.padding}`
    },
    // Message actions container
    messageActions: `flex flex-row ${spacing.message.internalGap} ${spacing.message.actionOffset}`,
    // Virtualized chat container
    virtualizedChat: `flex flex-col min-w-0 ${spacing.virtualized.itemGap} flex-1 h-full ${spacing.virtualized.containerPadding}`,
    // Input container
    inputContainer: `sticky inset-x-0 bottom-0 z-10 w-full bg-gradient-to-t from-background via-background to-transparent ${spacing.chat.inputGap}`,
    // Input form
    inputForm: `mx-auto flex max-w-3xl flex-col ${spacing.chat.formGap} bg-background`,
    // Markdown custom styles for messages
    markdownMessage: `${markdown.container} ${markdown.lists} ${markdown.headings} ${markdown.code} ${typography.messageText}`
}; 