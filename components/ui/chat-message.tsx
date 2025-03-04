"use client";

import * as React from "react";
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Message } from "ai";
import { RefreshCw } from "lucide-react";

export interface ChatMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  message: Message;
  isLastMessage?: boolean;
  onRegenerate?: () => void;
}

/**
 * A chat message component that follows ShadCN UI design patterns
 */
const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ className, message, isLastMessage, onRegenerate, ...props }, ref) => {
    const isUser = message.role === "user";

    // Helper function to render message content
    const renderMessageContent = (message: Message) => {
      // If message has parts, render those
      if (message.parts && message.parts.length > 0) {
        return message.parts.map((part, i) => {
          if (part.type === "text") {
            return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
          }
          return null;
        });
      }
      
      // Fallback to content
      return <p className="whitespace-pre-wrap">{message.content}</p>;
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full",
          isUser ? "justify-end" : "justify-start",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "flex gap-2 max-w-[80%]",
            isUser ? "flex-row-reverse" : "flex-row"
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className={cn(
              "text-xs font-medium",
              isUser 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted-foreground text-muted"
            )}>
              {isUser ? "U" : "AI"}
            </AvatarFallback>
          </Avatar>
          
          <Card
            className={cn(
              "px-3 py-2 shadow-sm",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            <div className="space-y-2">
              {renderMessageContent(message)}
              
              {!isUser && isLastMessage && onRegenerate && (
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRegenerate}
                    className="h-6 px-2 text-xs flex items-center gap-1 opacity-70 hover:opacity-100"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Regenerate</span>
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

export { ChatMessage }; 