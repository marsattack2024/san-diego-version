import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { styles, typography, markdown } from '@/lib/tokens';

/**
 * Specialized Markdown renderer for chat messages
 * Focused on correct spacing for multi-paragraph list items and proper bold formatting
 */

const messageComponents: Partial<Components> = {
    // Code block component - handled separately to avoid paragraph nesting issues
    // @ts-expect-error
    code: CodeBlock,
    // Remove pre tag rendering to avoid nesting issues
    pre: ({ children }) => <>{children}</>,

    // List components with tighter spacing
    ol: ({ node, children, ...props }) => {
        return (
            <ol className="list-decimal list-outside ml-4 my-1" {...props}>
                {children}
            </ol>
        );
    },
    li: ({ node, children, ...props }) => {
        return (
            <li className={typography.listItemSpacing} {...props}>
                {children}
            </li>
        );
    },
    ul: ({ node, children, ...props }) => {
        return (
            <ul className="list-disc list-outside ml-4 my-1" {...props}>
                {children}
            </ul>
        );
    },

    // Text formatting with proper bold styling
    strong: ({ node, children, ...props }) => {
        return (
            <span className={typography.strongText} {...props}>
                {children}
            </span>
        );
    },

    // Links
    a: ({ node, children, ...props }) => {
        return (
            // @ts-expect-error
            <Link
                className="text-primary underline underline-offset-2 hover:text-primary/90 transition-colors"
                target="_blank"
                rel="noreferrer"
                {...props}
            >
                {children}
            </Link>
        );
    },

    // Paragraph with minimal spacing - make sure children don't contain block elements
    p: ({ node, children, ...props }) => {
        // Check if this paragraph contains a <pre> or code block
        const containsCodeBlock = React.Children.toArray(children).some(
            child => typeof child === 'object' && React.isValidElement(child) &&
                (child.type === CodeBlock || (child.props && child.props.node &&
                    child.props.node.tagName === 'pre'))
        );

        // If it contains a code block, render without wrapping in a paragraph
        if (containsCodeBlock) {
            return <>{children}</>;
        }

        return (
            <p className={`${typography.paragraphSpacing} ${typography.messageLineHeight}`} {...props}>
                {children}
            </p>
        );
    },

    // Headings with minimal margins
    h1: ({ node, children, ...props }) => (
        <h1 className="text-xl font-semibold mt-2 mb-1" {...props}>{children}</h1>
    ),
    h2: ({ node, children, ...props }) => (
        <h2 className="text-lg font-semibold mt-1.5 mb-0.5" {...props}>{children}</h2>
    ),
    h3: ({ node, children, ...props }) => (
        <h3 className="text-base font-semibold mt-1 mb-0.5" {...props}>{children}</h3>
    ),

    // Table components with compact styling
    table: ({ node, children, ...props }) => (
        <div className="my-2 w-full overflow-auto">
            <table className="w-full border-collapse" {...props}>{children}</table>
        </div>
    ),
    thead: ({ node, children, ...props }) => (
        <thead className="bg-muted/50" {...props}>{children}</thead>
    ),
    tbody: ({ node, children, ...props }) => (
        <tbody {...props}>{children}</tbody>
    ),
    tr: ({ node, children, ...props }) => (
        <tr className="border-b border-border m-0 p-0 even:bg-muted/20" {...props}>{children}</tr>
    ),
    th: ({ node, children, ...props }) => (
        <th className="border border-border px-2 py-1 text-left font-semibold" {...props}>{children}</th>
    ),
    td: ({ node, children, ...props }) => (
        <td className="border border-border px-2 py-1 text-left" {...props}>{children}</td>
    ),
};

// Remark plugins configuration
const remarkPlugins = [remarkGfm];

/**
 * MessageMarkdown component specifically tuned for chat message rendering
 * Optimized for lists and paragraph spacing within messages
 */
const NonMemoizedMessageMarkdown = ({
    children,
    className
}: {
    children: string;
    className?: string;
}) => {
    // Special processing for line breaks to maintain clean spacing
    const formattedContent = children.replace(/(?<!\n)\n(?!\n)/g, '  \n');

    return (
        <div className={cn(
            styles.markdownMessage,
            typography.messageText,
            'font-medium',
            className
        )}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                components={messageComponents}
            >
                {formattedContent}
            </ReactMarkdown>
        </div>
    );
};

export const MessageMarkdown = memo(
    NonMemoizedMessageMarkdown,
    (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.className === nextProps.className,
); 