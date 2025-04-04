'use client';

import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState, useMemo } from 'react';
import type { Vote } from '@/lib/db/schema';
import { PencilEditIcon, SparklesIcon, MagnifyingGlassIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { MessageReasoning } from './message-reasoning';
import { RagResultCount } from './rag-result-count';
import { styles, spacing } from '@/lib/tokens';

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
  index,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  index: number;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Transform any JSON RAG results from message into more readable format
  const formattedContent = useMemo(() => {
    if (!message.content) return '';
    return message.content;
  }, [message.content]);

  // Check for message parts (used by AI SDK for tool calls)
  const hasParts = useMemo(() => {
    return message.parts && Array.isArray(message.parts) && message.parts.length > 0;
  }, [message.parts]);

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}-${index}`}
        className={styles.messageContainer}
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            styles.messageFlex,
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-9 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={16} />
              </div>
            </div>
          )}

          <div className={cn("flex flex-col w-full", spacing.message.internalGap)}>
            {message.experimental_attachments && (
              <div
                data-testid={`message-attachments-${index}`}
                className="flex flex-row justify-end gap-2"
              >
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {message.reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={message.reasoning}
              />
            )}

            {(message.content || message.reasoning || hasParts) && mode === 'view' && (
              <div className="flex flex-row gap-1 items-start">
                {message.role === 'user' && !isReadonly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        data-testid={`edit-${message.role}-${index}`}
                        variant="ghost"
                        className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                        onClick={() => {
                          setMode('edit');
                        }}
                      >
                        <PencilEditIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit message</TooltipContent>
                  </Tooltip>
                )}

                <div
                  className={cn(
                    'flex flex-col',
                    spacing.message.contentGap,
                    message.role === 'user'
                      ? styles.messageContent.user
                      : styles.messageContent.assistant
                  )}
                >
                  {/* Render message parts if available, otherwise fall back to content */}
                  {hasParts ? (
                    <div>
                      {message.parts?.map((part, idx) => {
                        // Handle text part type
                        if (part.type === 'text' && 'text' in part) {
                          return (
                            <Markdown
                              key={idx}
                              className={cn({
                                'text-foreground': message.role === 'assistant',
                                'text-white': message.role === 'user',
                                'opacity-90': isLoading && message.role === 'assistant',
                              })}
                            >
                              {part.text}
                            </Markdown>
                          );
                        }

                        // Handle tool calls more generically to avoid type issues
                        // This will catch any part that appears to be a tool call regardless of specific format
                        if ('tool_call_id' in part || 'name' in part || part.type?.toString().includes('tool')) {
                          // Get the tool name from whatever property might contain it
                          const toolName =
                            ('name' in part && typeof part.name === 'string') ? part.name :
                              'unknown tool';

                          return (
                            <div key={idx} className="text-xs text-muted-foreground my-1 p-1 bg-muted/30 rounded">
                              <span className="font-medium">Tool Call:</span> {toolName}
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  ) : (
                    <Markdown
                      className={cn({
                        'text-foreground': message.role === 'assistant',
                        'text-white': message.role === 'user',
                        'opacity-90': isLoading && message.role === 'assistant',
                      })}
                    >
                      {formattedContent}
                    </Markdown>
                  )}

                  {message.role === 'assistant' && isLoading && (
                    <ThinkingMessage
                      className="ml-1 inline-flex animate-pulse"
                    />
                  )}

                  {message.role === 'assistant' && (
                    <div className="flex items-center flex-wrap gap-2">
                      {/* DeepSearch badge removed */}
                    </div>
                  )}
                </div>
              </div>
            )}

            {message.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <div className="flex flex-col gap-2">
                {message.toolInvocations.map((toolInvocation) => {
                  const { toolName, toolCallId, state, args } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;

                    return (
                      <div key={toolCallId}>
                        {toolName === 'getInformation' ? (
                          <RagResultCount count={result.found ? result.documents.length : 0} />
                        ) : toolName === 'deepSearch' || toolName === 'webScraper' || toolName === 'detectAndScrapeUrls' ||
                          toolName === 'comprehensiveScraper' ||
                          toolName.includes('Scraper') || toolName.includes('Search') ? (
                          null
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            Tool used: {toolName}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getInformation' ? (
                        <RagResultCount count={args.found ? args.documents.length : 0} />
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Tool used: {toolName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!isReadonly && message.role === 'assistant' && (
              <div className="-mt-7">
                <MessageActions
                  key={`action-${message.id}`}
                  chatId={chatId}
                  messageId={message.id}
                  content={message.content as string}
                  vote={vote}
                  isLoading={isLoading}
                  isReadonly={isReadonly}
                  role="assistant"
                />
              </div>
            )}

            {!isReadonly && message.role === 'user' && (
              <div className="flex justify-end mt-1">
                <MessageActions
                  key={`action-${message.id}`}
                  chatId={chatId}
                  messageId={message.id}
                  content={message.content as string}
                  isLoading={isLoading}
                  isReadonly={true}  // Force readonly to hide voting buttons for user messages
                  role="user"
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.reasoning !== nextProps.message.reasoning)
      return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (
      !equal(
        prevProps.message.toolInvocations,
        nextProps.message.toolInvocations,
      )
    )
      return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    // Check for changes in message.parts
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;

    return true;
  },
);

export function ThinkingMessage({
  message = '',
  className
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <div className="text-primary/80">
        <SparklesIcon size={14} />
      </div>
      {message && <span className="font-medium">{message}</span>}
      <span className="flex items-center gap-0.5">
        <span className="thinking-dot thinking-dot-1 size-1.5 rounded-full bg-current"></span>
        <span className="thinking-dot thinking-dot-2 size-1.5 rounded-full bg-current"></span>
        <span className="thinking-dot thinking-dot-3 size-1.5 rounded-full bg-current"></span>
      </span>
    </div>
  );
}

// User message
export function UserMessage({ message }: { message: string }) {
  return (
    <div className={styles.messageContent.user}>
      <Markdown className="text-white">
        {message}
      </Markdown>
    </div>
  );
}

// Assistant message
export function AssistantMessage({ message }: { message: string }) {
  return (
    <div className={styles.messageContent.assistant}>
      <Markdown className="text-foreground">
        {message}
      </Markdown>
    </div>
  );
}
