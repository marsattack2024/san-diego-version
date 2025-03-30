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
        internalGap: 'gap-1',
        // Content gap within message bubbles
        contentGap: 'gap-0.5',
        // Base padding for message bubbles
        padding: 'px-4 py-2',
        // Offset for action buttons relative to message
        actionOffset: 'mt-0.5'
    },
    chat: {
        // Padding for the entire chat container
        containerPadding: 'pt-4 pb-2',
        // Spacing between input container and messages
        inputGap: 'pt-0.5 pb-2',
        // Spacing between input form elements
        formGap: 'gap-1'
    },
    virtualized: {
        // Default gap between virtualized list items
        itemGap: 'gap-1.5',
        // Default padding for virtualized containers
        containerPadding: 'pt-4 pb-1'
    }
};

/**
 * Typography tokens for consistent text styling
 */
export const typography = {
    // Line height for message content
    messageLineHeight: 'leading-normal',
    // Paragraph spacing in markdown content
    paragraphSpacing: 'my-0.5',
    // List item spacing in markdown content
    listItemSpacing: 'py-0.5',
    // List container spacing in markdown content
    listContainerSpacing: 'my-1.5',
    // Strong text styling
    strongText: 'font-semibold'
};

/**
 * UI element styling tokens
 */
export const ui = {
    // Message action button styling
    actionButton: 'py-0.5 px-1.5 h-fit',
    // Message content container styling
    messageContainer: 'w-full mx-auto max-w-3xl px-4 md:px-6',
    // User message bubble styling
    userMessage: 'bg-black text-white rounded-xl shadow-sm',
    // Assistant message bubble styling
    assistantMessage: 'rounded-xl',
    // Custom scrollbar styling
    scrollbar: 'scrollbar-thin custom-scrollbar'
};

/**
 * Markdown component style overrides
 */
export const markdown = {
    // Base markdown container styling
    container: 'prose-sm sm:prose-base max-w-none prose-p:my-0.5 prose-p:leading-normal',
    // List styling overrides
    lists: 'prose-li:my-0.5 prose-ol:my-1.5 prose-ul:my-1.5',
    // Heading styling overrides
    headings: 'prose-headings:my-1 prose-headings:font-semibold',
    // Code styling overrides
    code: 'prose-code:px-1 prose-code:py-0.5 prose-code:text-sm',
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
        user: `${ui.userMessage} ${spacing.message.padding}`,
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
    markdownMessage: `${markdown.container} ${markdown.lists} ${markdown.headings} ${markdown.code}`
}; 