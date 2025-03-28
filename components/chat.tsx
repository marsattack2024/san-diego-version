'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chat-store';
import { TooltipProvider } from './ui/tooltip';
import { historyService } from '@/lib/api/history-service';

export function Chat({
  id,
  initialMessages,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const selectedAgentId = useChatStore(state => state.selectedAgentId);
  const updateConversationMetadata = useChatStore(state => state.updateConversationMetadata);

  // Add ref for scroll container
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Ensure proper scroll position on page load
  useEffect(() => {
    // Function to scroll to bottom with retry
    const scrollToBottom = () => {
      if (chatContainerRef.current) {
        // Force scroll all the way to the bottom
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'auto'
        });

        // Try to ensure input is visible
        const inputForm = document.querySelector('form');
        if (inputForm) {
          inputForm.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
      }
    };

    // Try multiple times with increasing delay to ensure scroll works
    scrollToBottom();
    setTimeout(scrollToBottom, 50);
    setTimeout(scrollToBottom, 200);
    setTimeout(scrollToBottom, 500);

    // Also handle window load event
    const handlePageLoad = () => {
      scrollToBottom();
      setTimeout(scrollToBottom, 100);
    };

    window.addEventListener('load', handlePageLoad);

    return () => {
      window.removeEventListener('load', handlePageLoad);
    };
  }, []);

  // Update conversation metadata when agent changes
  useEffect(() => {
    if (id) {
      updateConversationMetadata(id, { agentId: selectedAgentId });
    }
  }, [id, selectedAgentId, updateConversationMetadata]);

  // Add a state to track message chat IDs
  const [messageIdMap, setMessageIdMap] = useState<Record<string, string>>({});

  // Add state for attachments
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: {
      id,
      deepSearchEnabled,
      agentId: selectedAgentId
    },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    // Optimize network traffic by only sending the last message
    experimental_prepareRequestBody({ messages, id }) {
      // Get the last message
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

      // Log the request body before sending
      console.info('[Chat] Preparing request body with Deep Search settings', {
        deepSearchEnabled,
        deepSearchEnabledType: typeof deepSearchEnabled,
        agentId: selectedAgentId,
        messageLength: lastMessage?.content?.length || 0,
        timestamp: new Date().toISOString()
      });

      // Return optimized payload with explicit boolean conversion
      return {
        message: lastMessage,
        id,
        deepSearchEnabled: deepSearchEnabled === true, // Force to boolean true/false
        agentId: selectedAgentId
      };
    },
    onFinish: async (message) => {
      try {
        // Extract tools used from message content
        let toolsUsed = null;
        const toolsSection = message.content.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);
        if (toolsSection && toolsSection[1]) {
          toolsUsed = {
            tools: toolsSection[1]
              .split('\n')
              .filter(line => line.trim().startsWith('-'))
              .map(line => line.trim())
          };
        }

        // Check if the message content is excessively large
        const contentLength = message.content.length;
        const isLargeMessage = contentLength > 100000; // ~100KB threshold

        // If message is very large, trim it to prevent database issues
        const trimmedContent = isLargeMessage
          ? message.content.substring(0, 100000) + `\n\n[Content truncated due to size. Original length: ${contentLength} characters]`
          : message.content;

        // Look up the corresponding request messageId that triggered this response
        const previousUserMessage = messages.slice().reverse().find(m => m.role === 'user');
        const requestMessageId = previousUserMessage ? messageIdMap[previousUserMessage.id] : null;

        console.log('Assistant message ready, server already saved it:', {
          requestMessageId,
          hasUserMessage: !!previousUserMessage,
          userMessageId: previousUserMessage?.id
        });

        // Update chat history to reflect the completed conversation
        historyService.invalidateCache();
      } catch (error) {
        console.error('Error processing completed assistant message:', error);
      }
    },
    onError: (error) => {
      // Only show toast for non-vote related errors
      console.error('Chat error:', error);

      // Check if the error is related to voting (if it contains vote in the URL)
      const errorUrl = error?.message || '';
      if (!errorUrl.includes('/api/vote')) {
        toast.error('An error occurred, please try again!');
      }
    },
  });

  // Simplified handleSubmit wrapper for UI consistency
  const handleSubmitWithSave = async (event?: { preventDefault?: (() => void) } | undefined, chatRequestOptions?: any) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    // Only proceed if there's input to send and not already loading
    if (!input.trim() || isLoading) {
      return;
    }

    try {
      console.log(`Processing chat for ID: ${id}`);

      // Generate a message ID for tracking
      const messageId = crypto.randomUUID();
      console.log(`Generated message ID for user message: ${messageId}`);

      // Store this ID for later reference
      const currentInput = input;

      // Submit directly to AI with the current input
      // The server will handle saving both the user message and assistant response
      await handleSubmit(event, chatRequestOptions);

      // After submission succeeds, wait a moment for the local state to update
      setTimeout(() => {
        // Find and map the user message ID
        const userMessage = messages.find(m => m.role === 'user' && m.content === currentInput);
        if (userMessage) {
          console.log('Found user message in state, updating mapping:', userMessage.id);
          setMessageIdMap(prev => ({
            ...prev,
            [userMessage.id]: messageId
          }));
        }
      }, 100);

    } catch (error) {
      console.error('Error in handleSubmitWithSave:', error);
      toast.error('An error occurred. Please try again.');
    }
  };

  // Process votes from message data instead of separate API calls
  const processedVotes = useMemo(() => {
    if (!messages) return [];

    // Extract votes from message data
    return messages
      .filter(msg => 'vote' in msg) // Only include messages that have votes
      .map(msg => ({
        chatId: id,
        messageId: msg.id || '',
        isUpvoted: (msg as any).vote === 'up'
      }));
  }, [messages, id]);

  // More reliable scroll handling with useLayoutEffect
  useLayoutEffect(() => {
    const ensureProperScroll = () => {
      if (!chatContainerRef.current || !inputContainerRef.current) return;

      // Force scroll to bottom
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    };

    // Initial scroll
    ensureProperScroll();

    // And after a short delay to catch any post-render changes
    const timeoutId = setTimeout(ensureProperScroll, 100);

    return () => clearTimeout(timeoutId);
  }, [messages.length]); // Depend on message count

  // Add before the return statement to ensure proper scrolling when the input expands
  useEffect(() => {
    // Function to ensure the input is visible
    const ensureInputVisible = () => {
      if (inputContainerRef.current) {
        // Use a simpler check that doesn't cause excessive scrolling
        const rect = inputContainerRef.current.getBoundingClientRect();
        const isOutOfView = rect.bottom > window.innerHeight + 100; // Increased offset to account for larger input

        if (isOutOfView) {
          inputContainerRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest'
          });
        }
      }
    };

    // Watch for input changes to ensure visibility, but only for longer inputs
    if (input.length > 100) {
      requestAnimationFrame(ensureInputVisible);
    }

    // Set up resize observer with debouncing
    if (inputContainerRef.current) {
      let timeoutId: ReturnType<typeof setTimeout>;

      const resizeObserver = new ResizeObserver(() => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(ensureInputVisible, 100);
      });

      resizeObserver.observe(inputContainerRef.current);

      return () => {
        clearTimeout(timeoutId);
        resizeObserver.disconnect();
      };
    }
  }, [input]);

  // Display the messages with the correct layout
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col bg-primary-foreground h-full pt-14">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto pb-8">
          <Messages
            chatId={id}
            isLoading={isLoading}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            votes={processedVotes}
            isArtifactVisible={!!attachments.length}
          />
        </div>
        <div
          ref={inputContainerRef}
          className="sticky inset-x-0 bottom-0 z-10 w-full bg-gradient-to-t from-background via-background to-transparent pb-3 pt-1 md:pb-4"
        >
          <form
            onSubmit={handleSubmitWithSave}
            className="mx-auto flex max-w-3xl flex-col gap-2 bg-background pt-0 pb-4 px-2 md:px-0"
          >
            {!isReadonly && (
              <MultimodalInput
                chatId={id}
                input={input}
                setInput={setInput}
                handleSubmit={handleSubmitWithSave}
                isLoading={isLoading}
                stop={stop}
                attachments={attachments}
                setAttachments={setAttachments}
                messages={messages}
                setMessages={setMessages}
                append={append}
              />
            )}
          </form>
        </div>
      </div>
    </TooltipProvider>
  );
}
