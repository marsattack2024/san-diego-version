'use client';

import { Message } from 'ai';
import { cn } from '@/lib/utils';
import { memo, useEffect } from 'react';
import { createLogger } from '@/utils/client-logger';

// Create a logger for this component
const log = createLogger('MessageItem');

interface MessageItemProps {
  message: Message;
  isLastMessage: boolean;
}

// Custom comparison function for React.memo
function areEqual(prevProps: MessageItemProps, nextProps: MessageItemProps) {
  // Only re-render if the content or role changes
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.role === nextProps.message.role &&
    prevProps.isLastMessage === nextProps.isLastMessage
  );
}

function MessageItemComponent({ message, isLastMessage }: MessageItemProps) {
  const isUser = message.role === 'user';
  
  // Add detailed logging for each message being rendered
  useEffect(() => {
    log.debug('Rendering message', {
      messageId: message.id,
      messageRole: message.role,
      messageContent: message.content.substring(0, 50) + (message.content.length > 50 ? '...' : ''),
      isLastMessage,
      contentLength: message.content.length
    });
    
    return () => {
      log.debug('Message unmounting', { messageId: message.id });
    };
  }, [message, isLastMessage]);
  
  return (
    <div className={cn(
      "flex w-full my-4",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[80%] rounded-lg p-4",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}

// Export memoized component
export const MessageItem = memo(MessageItemComponent, areEqual);
