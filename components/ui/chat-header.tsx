"use client";

import * as React from "react";
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlusCircle } from "lucide-react";

export interface ChatHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The title of the chat
   * @default "AI Chat"
   */
  title?: string;
  /**
   * Whether to show the new chat button
   * @default true
   */
  showNewChat?: boolean;
  /**
   * Callback for when the new chat button is clicked
   */
  onNewChat?: () => void;
}

/**
 * A chat header component that follows ShadCN UI design patterns
 */
const ChatHeader = React.forwardRef<HTMLDivElement, ChatHeaderProps>(
  ({ 
    className, 
    title = "AI Chat", 
    showNewChat = true, 
    onNewChat, 
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex justify-between items-center p-4 border-b",
          className
        )}
        {...props}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        
        {showNewChat && onNewChat && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNewChat}
            className="gap-1"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Chat</span>
          </Button>
        )}
      </div>
    );
  }
);

ChatHeader.displayName = "ChatHeader";

export { ChatHeader }; 