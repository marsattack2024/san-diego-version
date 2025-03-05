'use client';

import { memo } from 'react';

interface RagResultCountProps {
  count: number;
}

function PureRagResultCount({ count }: RagResultCountProps) {
  // Don't show anything if no documents were found
  if (count === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-1.5 w-fit">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lucide lucide-search"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span>
        {count} {count === 1 ? 'document' : 'documents'} found
      </span>
    </div>
  );
}

export const RagResultCount = memo(PureRagResultCount); 