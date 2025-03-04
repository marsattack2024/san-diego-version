"use client";

import * as React from "react";
import { cn } from '@/lib/utils';
import { MessageSquare } from "lucide-react";

export interface ChatEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The message to display
   * @default "No messages yet. Start a conversation!"
   */
  message?: string;
}

/**
 * A chat empty state component that follows ShadCN UI design patterns
 */
const ChatEmptyState = React.forwardRef<HTMLDivElement, ChatEmptyStateProps>(
  ({ 
    className, 
    message = "No messages yet. Start a conversation!", 
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground",
          className
        )}
        {...props}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-full bg-muted p-3">
            <MessageSquare className="h-6 w-6" />
          </div>
          <p>{message}</p>
        </div>
      </div>
    );
  }
);

ChatEmptyState.displayName = "ChatEmptyState";

export { ChatEmptyState }; 