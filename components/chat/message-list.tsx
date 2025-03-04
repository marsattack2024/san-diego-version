'use client';

import { useRef, useEffect, useState, Suspense } from 'react';
import { Message } from 'ai';
import { MessageItem } from './message-item';
import { LoadingSpinner } from './loading-spinner';
import { MessageSkeletonGroup } from './message-skeleton';
import { logger } from '@/lib/logger';

// Constants for windowing
const VISIBLE_MESSAGES_COUNT = 15;
const MESSAGE_BATCH_SIZE = 10;

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef?: React.RefObject<HTMLDivElement>;
}

// Helper function to batch messages for large conversations
function useMessageBatching(messages: Message[]) {
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [showLoadMore, setShowLoadMore] = useState(false);
  
  useEffect(() => {
    // Always show the most recent messages
    if (messages.length <= VISIBLE_MESSAGES_COUNT) {
      setVisibleMessages(messages);
      setShowLoadMore(false);
    } else {
      // Show the most recent VISIBLE_MESSAGES_COUNT messages
      setVisibleMessages(messages.slice(-VISIBLE_MESSAGES_COUNT));
      setShowLoadMore(true);
    }
    
    // Log message count in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`Total messages: ${messages.length}, Visible: ${Math.min(messages.length, VISIBLE_MESSAGES_COUNT)}`);
    }
  }, [messages]);
  
  const loadMoreMessages = () => {
    setVisibleMessages(prevVisible => {
      const currentCount = prevVisible.length;
      const startIndex = Math.max(0, messages.length - currentCount - MESSAGE_BATCH_SIZE);
      const additionalMessages = messages.slice(startIndex, messages.length - currentCount);
      
      const newVisibleMessages = [...additionalMessages, ...prevVisible];
      setShowLoadMore(newVisibleMessages.length < messages.length);
      
      return newVisibleMessages;
    });
  };
  
  return { visibleMessages, showLoadMore, loadMoreMessages };
}

export function MessageList({ messages, isLoading, messagesEndRef }: MessageListProps) {
  const { visibleMessages, showLoadMore, loadMoreMessages } = useMessageBatching(messages);
  const prevMessagesLengthRef = useRef(messages.length);
  
  // Add detailed logging of messages being rendered
  useEffect(() => {
    // Log message details to help debug rendering issues
    logger.debug(`[MessageList] Received ${messages.length} messages, showing ${visibleMessages.length}`, {
      messageRoles: visibleMessages.map(m => m.role),
      messageIds: visibleMessages.map(m => m.id),
      hasUserMessages: visibleMessages.some(m => m.role === 'user'),
      hasAssistantMessages: visibleMessages.some(m => m.role === 'assistant')
    });
    
    // Log when new messages are added
    if (messages.length > prevMessagesLengthRef.current) {
      const newMessages = messages.slice(prevMessagesLengthRef.current);
      logger.debug(`[MessageList] ${newMessages.length} new messages added:`, {
        newMessageRoles: newMessages.map(m => m.role),
        newMessageIds: newMessages.map(m => m.id)
      });
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages, visibleMessages]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef && !showLoadMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleMessages, showLoadMore]);
  
  // Render message content with suspense
  const renderMessages = () => {
    if (visibleMessages.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">No messages yet. Start a conversation!</p>
        </div>
      );
    }
    
    return (
      <>
        {showLoadMore && (
          <div className="flex justify-center my-4">
            <button 
              onClick={loadMoreMessages}
              className="px-4 py-2 text-sm bg-muted rounded-md hover:bg-muted/80 transition-colors"
            >
              Load earlier messages
            </button>
          </div>
        )}
        
        {visibleMessages.map((message, index) => {
          const isLastMessage = index === visibleMessages.length - 1;
          
          // Log each message being rendered to help debug
          logger.debug(`[MessageList] Rendering message ${index + 1}/${visibleMessages.length}`, {
            messageId: message.id,
            messageRole: message.role,
            messageContent: message.content.substring(0, 30) + (message.content.length > 30 ? '...' : ''),
            isLastMessage
          });
          
          return (
            <Suspense key={`${message.id}-${index}`} fallback={<MessageSkeletonGroup />}>
              <MessageItem 
                message={message} 
                isLastMessage={isLastMessage} 
              />
            </Suspense>
          );
        })}
      </>
    );
  };
  
  return (
    <div className="flex flex-col space-y-4 p-4 overflow-y-auto h-full">
      {renderMessages()}
      
      {isLoading && (
        <div aria-live="polite" className="my-4">
          <MessageSkeletonGroup />
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
