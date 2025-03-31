import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

const components: Partial<Components> = {
  // @ts-expect-error
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-disc list-outside ml-4" {...props}>
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <strong
        className="font-black text-primary"
        style={{
          fontWeight: 900, /* Maximum valid font weight */
          color: 'inherit',
          textShadow: '0 0 0.5px currentColor' /* Subtle text shadow for emphasis without fuzziness */
        }}
        {...props}
      >
        {children}
      </strong>
    );
  },
  a: ({ node, children, ...props }) => {
    return (
      // @ts-expect-error
      <Link
        className="text-blue-500 hover:underline"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  // Add paragraph component to prevent wrapping code blocks in <p> tags
  p: ({ node, children, ...props }) => {
    // Helper function to recursively check for code blocks in children
    const containsCodeBlock = (children: React.ReactNode): boolean => {
      return React.Children.toArray(children).some(child => {
        // Direct code block
        if (typeof child === 'object' &&
          React.isValidElement(child) &&
          (child.type === CodeBlock ||
            (child.props?.node?.tagName === 'pre' ||
              child.props?.className?.includes('language-')))) {
          return true;
        }

        // Check if it's an element with its own children that might contain code blocks
        if (typeof child === 'object' &&
          React.isValidElement(child)) {
          // TypeScript doesn't know child.props might have children
          // Use type assertion to safely access potential children
          const childProps = child.props as { children?: React.ReactNode };
          if (childProps.children) {
            return containsCodeBlock(childProps.children);
          }
        }

        return false;
      });
    };

    // If it contains a code block, render without wrapping in a paragraph
    if (containsCodeBlock(children)) {
      return <>{children}</>;
    }

    return (
      <p {...props}>
        {children}
      </p>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-black mt-8 mb-4 pb-1 border-b border-muted" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-extrabold mt-6 mb-3" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-bold mt-5 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-lg font-semibold mt-4 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-base font-medium mt-3 mb-1" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-sm font-medium italic mt-3 mb-1" {...props}>
        {children}
      </h6>
    );
  },
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown = ({ children, className }: { children: string; className?: string }) => {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.className === nextProps.className,
);