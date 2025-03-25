import { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo } from 'react';
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
}

function PureMessages({
  chatId,
  isLoading,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const isDeepSearchInProgress = useChatStore(state => state.isDeepSearchInProgress);

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
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

      {/* Show thinking indicator when either normal loading or deep search is in progress */}
      {(isLoading || isDeepSearchInProgress) && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex flex-col gap-2 px-4 md:px-6 w-full max-w-3xl mx-auto">
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
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoading && nextProps.isLoading) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;

  return true;
});
