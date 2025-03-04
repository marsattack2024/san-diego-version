'use client';

import { useState, useRef, useEffect } from 'react';
import { Textarea } from '../../../components/ui/textarea';
import { Button } from '../../../components/ui/button';
import { Send } from 'lucide-react';
import { createLogger } from '../../utils/client-logger';

const logger = createLogger('components:chat-input');

interface ChatInputProps {
  input: string;
  handleInputChange: (value: string) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
}

/**
 * Chat input component with message input and send button
 */
export function ChatInput({ 
  input, 
  handleInputChange, 
  handleSubmit, 
  isLoading
}: ChatInputProps) {
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Adjust textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      const lineHeight = 24; // Approximate line height in pixels
      const minRows = 1;
      const maxRows = 5;
      
      const previousRows = textareaRef.current.rows;
      textareaRef.current.rows = minRows; // Reset rows
      
      const currentRows = Math.floor(textareaRef.current.scrollHeight / lineHeight);
      
      if (currentRows === previousRows) {
        textareaRef.current.rows = currentRows;
      } else {
        textareaRef.current.rows = currentRows > maxRows ? maxRows : currentRows;
      }
      
      setRows(textareaRef.current.rows);
    }
  }, [input]);
  
  return (
    <form 
      onSubmit={handleSubmit} 
      className="flex flex-col gap-2 border-t p-4"
    >
      <div className="flex items-center gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Type a message..."
          className="min-h-10 flex-1 resize-none"
          rows={rows}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (input.trim()) {
                const form = e.currentTarget.form;
                if (form) form.requestSubmit();
              }
            }
          }}
        />
        <Button 
          type="submit" 
          size="icon" 
          disabled={isLoading || !input.trim()}
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
}
