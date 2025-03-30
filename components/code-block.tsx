'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function CodeBlock({
  node,
  inline,
  className,
  children,
  ...props
}: CodeBlockProps) {
  // Determine the language from the className (format: "language-xxx")
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  // Handle inline code
  if (inline) {
    return (
      <code
        className="bg-muted text-foreground text-sm py-0.5 px-1 rounded-md font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // For block code, return React Fragment to avoid nesting constraints
  // This prevents the <div> from being nested inside a <p> tag
  return (
    <>
      <div className="not-prose flex flex-col rounded-md overflow-hidden my-4">
        {language && (
          <div className="bg-muted px-4 py-1 text-xs text-muted-foreground border-b border-border">
            {language}
          </div>
        )}
        <pre
          {...props}
          className={cn(
            'text-sm w-full overflow-x-auto bg-muted p-4',
            'text-foreground font-mono',
            !language && 'rounded-t-md'
          )}
        >
          <code className="whitespace-pre-wrap break-words">{children}</code>
        </pre>
      </div>
    </>
  );
}
