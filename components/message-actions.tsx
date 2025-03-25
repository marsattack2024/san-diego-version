import type { Message } from 'ai';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { useCopyToClipboard } from 'usehooks-ts';

import type { Vote } from '@/lib/db/schema';

import { CopyIcon, ThumbDownIcon, ThumbUpIcon } from './icons';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { memo, useCallback } from 'react';
import equal from 'fast-deep-equal';

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();

  // Memoize the vote handlers to prevent infinite render loops
  const handleUpvote = useCallback(async () => {
    try {
      // Create a stable key for the chat API
      const chatApiKey = `/api/chat/${chatId}`;

      // Update the UI optimistically before the API call
      mutate(
        chatApiKey,
        (currentChat: any) => {
          if (!currentChat || !currentChat.messages) return currentChat;

          // Find the message to update
          const updatedMessages = currentChat.messages.map((msg: any) => {
            if (msg.id === message.id) {
              return { ...msg, vote: 'up' };
            }
            return msg;
          });

          return { ...currentChat, messages: updatedMessages };
        },
        {
          revalidate: false,
          populateCache: true,
        }
      );
      
      toast.success('Upvoted Response!');
      
      // Make the API call with credentials included
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin', // Ensure cookies are sent
        body: JSON.stringify({
          // Format message ID to include chat ID for proper identification
          messageId: message.id?.startsWith('msg-') ? `${chatId}-${message.id}` : message.id,
          vote: 'up',
        }),
      });
      
      // Handle API error silently without disturbing user
      if (!response.ok) {
        console.warn('Vote API error:', await response.text());
      }
    } catch (error) {
      console.error('Error upvoting:', error);
      // Don't show error toast as we've already shown success
    }
  }, [chatId, message.id, mutate]);

  const handleDownvote = useCallback(async () => {
    try {
      // Create a stable key for the chat API
      const chatApiKey = `/api/chat/${chatId}`;

      // Update the UI optimistically before the API call
      mutate(
        chatApiKey,
        (currentChat: any) => {
          if (!currentChat || !currentChat.messages) return currentChat;

          // Find the message to update
          const updatedMessages = currentChat.messages.map((msg: any) => {
            if (msg.id === message.id) {
              return { ...msg, vote: 'down' };
            }
            return msg;
          });

          return { ...currentChat, messages: updatedMessages };
        },
        {
          revalidate: false,
          populateCache: true,
        }
      );
      
      toast.success('Downvoted Response!');
      
      // Make the API call with credentials included
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin', // Ensure cookies are sent
        body: JSON.stringify({
          // Format message ID to include chat ID for proper identification
          messageId: message.id?.startsWith('msg-') ? `${chatId}-${message.id}` : message.id,
          vote: 'down',
        }),
      });
      
      // Handle API error silently without disturbing user
      if (!response.ok) {
        console.warn('Vote API error:', await response.text());
      }
    } catch (error) {
      console.error('Error downvoting:', error);
      // Don't show error toast as we've already shown success
    }
  }, [chatId, message.id, mutate]);

  if (isLoading) return null;
  if (message.role === 'user') return null;
  if (message.toolInvocations && message.toolInvocations.length > 0)
    return null;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-row gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={async () => {
                await copyToClipboard(message.content as string);
                toast.success('Copied to clipboard!');
              }}
            >
              <CopyIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              disabled={vote?.isUpvoted}
              variant="outline"
              onClick={handleUpvote}
            >
              <ThumbUpIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upvote Response</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              variant="outline"
              disabled={vote && !vote.isUpvoted}
              onClick={handleDownvote}
            >
              <ThumbDownIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Downvote Response</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;

    return true;
  },
);
