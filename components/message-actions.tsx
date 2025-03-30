import { memo, useCallback, useState } from 'react';
import type { Message } from 'ai';
import {
  CopyIcon,
  ThumbUpIcon,
  ThumbDownIcon,
} from './icons';
import type { Vote } from '@/lib/db/schema';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { styles, ui } from '@/lib/tokens';
import equal from 'fast-deep-equal';

export interface MessageActionsProps {
  messageId: string;
  chatId: string;
  isLoading?: boolean;
  isReadonly?: boolean;
  content?: string;
  vote?: Vote;
}

function PureMessageActions({
  messageId,
  chatId,
  isLoading,
  isReadonly,
  content,
  vote,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  // Handle the copy action
  const handleCopy = useCallback(() => {
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true);
        toast.success('Copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [content]);

  // Handle upvote
  const handleUpvote = useCallback(async () => {
    setPending(true);
    try {
      toast.success('Upvoted response');
      // API call would go here
    } catch (error) {
      console.error('Error upvoting:', error);
      toast.error('Failed to save your feedback');
    } finally {
      setPending(false);
    }
  }, []);

  // Handle downvote
  const handleDownvote = useCallback(async () => {
    setPending(true);
    try {
      toast.success('Downvoted response');
      // API call would go here
    } catch (error) {
      console.error('Error downvoting:', error);
      toast.error('Failed to save your feedback');
    } finally {
      setPending(false);
    }
  }, []);

  if (isLoading) return null;

  return (
    <div className={cn(styles.messageActions, "pb-4 mb-1")}>
      <TooltipProvider>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={ui.actionButton}
                variant="outline"
                onClick={handleCopy}
                disabled={!content}
              >
                <CopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>

          {!isReadonly && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className={ui.actionButton}
                    variant="outline"
                    onClick={handleUpvote}
                    disabled={pending}
                  >
                    <ThumbUpIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upvote Response</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className={ui.actionButton}
                    variant="outline"
                    onClick={handleDownvote}
                    disabled={pending}
                  >
                    <ThumbDownIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Downvote Response</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;
    if (prevProps.content !== nextProps.content) return false;
    return true;
  }
);
