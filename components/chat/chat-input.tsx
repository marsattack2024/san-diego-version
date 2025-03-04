'use client';

import { useState, useRef, useEffect } from 'react';
import { SendIcon, StopCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ChatRequestOptions } from 'ai';

export interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onStop?: () => void;
  onRegenerate?: (options?: ChatRequestOptions) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  onStop,
  onRegenerate,
  disabled = false
}: ChatInputProps) {
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Adjust textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight);
      const minRows = 1;
      const maxRows = 5;
      
      const newRows = Math.min(
        maxRows,
        Math.max(
          minRows,
          Math.ceil(textareaRef.current.scrollHeight / lineHeight)
        )
      );
      
      setRows(newRows);
    }
  }, [input]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      // Only submit if input is not empty
      if (input.trim().length > 0 && !isLoading) {
        const formEvent = new Event('submit', { cancelable: true }) as unknown as React.FormEvent;
        handleSubmit(formEvent);
      }
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className={cn(
          "pr-12 resize-none",
          rows > 1 ? "pb-12" : "pb-4"
        )}
        rows={rows}
        disabled={isLoading || disabled}
      />
      
      <div className={cn(
        "absolute right-2",
        rows > 1 ? "bottom-2" : "bottom-2 top-2 flex items-center"
      )}>
        {isLoading ? (
          <div className="flex space-x-2">
            {onStop && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onStop}
                className="h-8 w-8"
                aria-label="Stop generating"
                disabled={disabled}
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex space-x-2">
            {onRegenerate && input.length === 0 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onRegenerate()}
                className="h-8 w-8"
                aria-label="Regenerate response"
                disabled={disabled}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={input.trim().length === 0 || disabled}
              aria-label="Send message"
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
