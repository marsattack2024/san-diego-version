import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // @ts-expect-error
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4 my-2" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-0.5" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-disc list-outside ml-4 my-2" {...props}>
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span 
        className="font-extrabold text-primary" 
        style={{ color: 'hsl(var(--primary))', fontWeight: 800 }}
        {...props}
      >
        {children}
      </span>
    );
  },
  a: ({ node, children, ...props }) => {
    return (
      // @ts-expect-error
      <Link
        className="text-primary underline underline-offset-2 hover:text-primary/90 transition-colors"
        target="_blank" // Opens links in new windows/tabs
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  p: ({ node, children, ...props }) => {
    return (
      <p className="mb-1.5 last:mb-0 leading-relaxed" {...props}>
        {children}
      </p>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-2xl font-semibold mt-6 mb-3" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-xl font-semibold mt-5 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-lg font-semibold mt-4 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-base font-semibold mt-4 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-sm font-semibold mt-3 mb-1" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-xs font-semibold mt-3 mb-1" {...props}>
        {children}
      </h6>
    );
  },
  blockquote: ({ node, children, ...props }) => {
    return (
      <blockquote className="border-l-2 border-muted pl-4 italic my-3 text-muted-foreground" {...props}>
        {children}
      </blockquote>
    );
  },
  hr: ({ node, ...props }) => {
    return <hr className="my-4 border-muted" {...props} />;
  },
  table: ({ node, children, ...props }) => {
    return (
      <div className="my-4 w-full overflow-auto">
        <table className="w-full border-collapse" {...props}>
          {children}
        </table>
      </div>
    );
  },
  thead: ({ node, children, ...props }) => {
    return (
      <thead className="bg-muted/50" {...props}>
        {children}
      </thead>
    );
  },
  tbody: ({ node, children, ...props }) => {
    return <tbody {...props}>{children}</tbody>;
  },
  tr: ({ node, children, ...props }) => {
    return <tr className="border-b border-border m-0 p-0 even:bg-muted/20" {...props}>{children}</tr>;
  },
  th: ({ node, children, ...props }) => {
    return <th className="border border-border px-4 py-2 text-left font-semibold" {...props}>{children}</th>;
  },
  td: ({ node, children, ...props }) => {
    return <td className="border border-border px-4 py-2 text-left" {...props}>{children}</td>;
  },
  img: ({ node, ...props }) => {
    return <img className="rounded-md max-w-full h-auto my-2" alt={props.alt || ''} {...props} />;
  }
};

const remarkPlugins = [remarkGfm];

// Create a wrapper div with the className to style the Markdown content
const NonMemoizedMarkdown = ({ children, className }: { children: string; className?: string }) => {
  // Preserve line breaks by replacing single newlines with line break tags
  // This approach maintains compatibility with existing content while allowing proper styling
  const formattedContent = children.replace(/(?<!\n)\n(?!\n)/g, '  \n');

  return (
    <div className={cn(
      'prose dark:prose-invert max-w-none',
      'prose-headings:font-semibold prose-headings:text-foreground',
      'prose-strong:font-extrabold prose-strong:text-primary',
      'prose-p:leading-normal prose-p:my-1.5',
      'prose-li:my-0.5',
      'prose-code:bg-muted prose-code:text-foreground prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm',
      'prose-pre:bg-muted prose-pre:text-foreground prose-pre:p-3 prose-pre:rounded-md',
      'prose-blockquote:border-l-2 prose-blockquote:pl-4 prose-blockquote:text-muted-foreground',
      'prose-img:rounded-md',
      className
    )}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={components}
      >
        {formattedContent}
      </ReactMarkdown>
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.className === nextProps.className,
);
