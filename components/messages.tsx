import { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo, useState, useEffect, useRef } from 'react';
import { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import { useChatStore } from '@/stores/chat-store';
import { MagnifyingGlassIcon , SparklesIcon } from './icons';
import { cx } from 'class-variance-authority';

interface MessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<Message>;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  isArtifactVisible?: boolean;
}

function PureMessages({
  chatId,
  isLoading,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
  isArtifactVisible,
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const isDeepSearchInProgress = useChatStore(state => state.isDeepSearchInProgress);
  
  // State to show thinking indicator immediately, even before server responds
  const [localThinking, setLocalThinking] = useState(false);
  const renderedRef = useRef(false);
  
  // Update local thinking state when isLoading changes
  useEffect(() => {
    if (isLoading) {
      setLocalThinking(true);
    } else {
      // Add a slight delay before hiding the indicator to prevent flickering
      const timer = setTimeout(() => setLocalThinking(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Flag to mark component as rendered
  useEffect(() => {
    renderedRef.current = true;
    
    return () => {
      renderedRef.current = false;
    };
  }, []);

  // Show thinking indicator for user messages or when explicitly loading
  const shouldShowThinking = (localThinking || isLoading || isDeepSearchInProgress) && 
    (messages.length === 0 || messages[messages.length - 1]?.role === 'user');

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-3 flex-1 overflow-y-auto h-full pt-3 pb-0"
    >
      {messages.length === 0 && <Overview />}

      {messages.map((message, index) => (
        <PreviewMessage
          key={message.id}
          index={index}
          chatId={chatId}
          message={message}
          isLoading={isLoading && messages.length - 1 === index}
          vote={votes?.find((vote) => vote.messageId === message.id) || undefined}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {/* Show thinking indicator immediately on local state or server state */}
      {shouldShowThinking && (
        <div className="flex flex-col gap-2 px-4 md:px-6 w-full max-w-3xl mx-auto mb-0">
          <div className="flex justify-end">
            <div className="flex items-center gap-2 bg-background rounded-xl p-3 shadow-sm">
              <ThinkingMessage 
                message={deepSearchEnabled ? "Thinking & searching" : "Thinking"} 
                className="animate-pulse"
              />
            </div>
          </div>
        </div>
      )}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[12px]"
        aria-hidden="true"
      />
    </div>
  );
}

// Use memo with more precise comparison to prevent unnecessary re-renders
export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  // Always re-render if loading state changes
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  
  // Always re-render if message count changes
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  
  // Compare message content and votes for changes
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;

  // No significant changes, skip re-render
  return true;
});
