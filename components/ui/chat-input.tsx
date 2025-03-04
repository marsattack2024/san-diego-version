"use client";

import * as React from "react";
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Send, StopCircle } from "lucide-react";

export interface ChatInputProps extends React.HTMLAttributes<HTMLFormElement> {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onStop?: () => void;
}

/**
 * A chat input component that follows ShadCN UI design patterns
 */
const ChatInput = React.forwardRef<HTMLFormElement, ChatInputProps>(
  ({ className, input, handleInputChange, handleSubmit, isLoading, onStop, ...props }, ref) => {
    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn("flex items-center gap-2 p-4 border-t", className)}
        {...props}
      >
        <Input
          placeholder="Type your message..."
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          className="flex-1"
        />
        
        {isLoading ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onStop}
              className="h-10 w-10 rounded-full"
              disabled={!onStop}
            >
              <StopCircle className="h-5 w-5" />
              <span className="sr-only">Stop generating</span>
            </Button>
            
            <Button disabled className="gap-2">
              <LoadingSpinner size="sm" />
              <span>Generating...</span>
            </Button>
          </div>
        ) : (
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            <span>Send</span>
          </Button>
        )}
      </form>
    );
  }
);

ChatInput.displayName = "ChatInput";

export { ChatInput }; 