'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chat-store';
import { TooltipProvider } from './ui/tooltip';

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

  // Update conversation metadata when agent changes
  useEffect(() => {
    if (id) {
      updateConversationMetadata(id, { agentId: selectedAgentId });
    }
  }, [id, selectedAgentId, updateConversationMetadata]);

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
    onFinish: async (message) => {
      // Store assistant message in Supabase after streaming completes
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
        
        // Save the assistant message to Supabase
        const response = await fetch(`/api/chat/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              role: message.role,
              content: message.content,
            },
            toolsUsed,
          }),
        });
        
        if (!response.ok) {
          console.error('Failed to save assistant message');
        }
      } catch (error) {
        console.error('Error saving assistant message:', error);
      }
      
      // Update chat history
      mutate('/api/history');
    },
    onError: () => {
      toast.error('An error occurred, please try again!');
    },
  });

  // Use SWR to fetch votes with error handling and retry configuration
  const { data: votes, error: voteError } = useSWR<Array<Vote>>(
    id ? `/api/vote?chatId=${id}` : null, // Only fetch if we have an ID
    fetcher,
    {
      // Add additional options for SWR
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      onError: (err) => {
        console.warn('Failed to load votes:', err);
        // Don't show toast for this error as it's not critical
      }
    }
  );
  
  // If we had a vote error, log it but continue with empty votes
  useEffect(() => {
    if (voteError) {
      console.warn('Vote loading error:', voteError);
    }
  }, [voteError]);

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  return (
    <TooltipProvider>
      <>
        <div className="flex flex-col min-w-0 h-dvh bg-background">
          <ChatHeader
            chatId={id}
            isReadonly={isReadonly}
          />

          <Messages
            chatId={id}
            isLoading={isLoading}
            votes={votes}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            isArtifactVisible={isArtifactVisible}
          />

          <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
            {!isReadonly && (
              <MultimodalInput
                chatId={id}
                input={input}
                setInput={setInput}
                handleSubmit={handleSubmit}
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

        <Artifact
          chatId={id}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          stop={stop}
          attachments={attachments}
          setAttachments={setAttachments}
          append={append}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          votes={votes}
          isReadonly={isReadonly}
        />
      </>
    </TooltipProvider>
  );
}
