'use client';

import { cn } from '@/lib/utils';

export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn(
      "flex w-full my-4",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[80%] rounded-lg p-4",
        isUser ? "bg-primary/20" : "bg-muted/50"
      )}>
        <div className="flex flex-col gap-2">
          <div className="h-4 w-3/4 bg-muted-foreground/20 rounded animate-pulse" />
          <div className="h-4 w-full bg-muted-foreground/20 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-muted-foreground/20 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-muted-foreground/20 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function MessageSkeletonGroup() {
  return (
    <div className="space-y-4">
      <MessageSkeleton isUser={true} />
      <MessageSkeleton isUser={false} />
      <MessageSkeleton isUser={false} />
    </div>
  );
} 