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
        
        // Check if the message content is excessively large
        const contentLength = message.content.length;
        const isLargeMessage = contentLength > 100000; // ~100KB threshold
        
        // If message is very large, trim it to prevent database issues
        const trimmedContent = isLargeMessage 
          ? message.content.substring(0, 100000) + `\n\n[Content truncated due to size. Original length: ${contentLength} characters]`
          : message.content;
        
        // Save the assistant message to Supabase
        const response = await fetch(`/api/chat/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              role: message.role,
              content: trimmedContent,
            },
            toolsUsed,
          }),
        });
        
        if (!response.ok) {
          // Get detailed error information from the response
          response.json().then(data => {
            console.error('Failed to save assistant message:', data);
          }).catch(err => {
            console.error('Failed to save assistant message, could not parse error:', err);
          });
        }
      } catch (error) {
        console.error('Error saving assistant message:', error);
      }
      
      // Update chat history
      mutate('/api/history');
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

  // Function to save user message to the database
  const saveUserMessage = async (content: string) => {
    if (content.length > 0) {
      try {
        // Save the user message to Supabase
        const response = await fetch(`/api/chat/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              role: 'user',
              content: content,
            },
            updateTimestamp: true, // Signal to update the session timestamp
          }),
        });
        
        if (!response.ok) {
          // Get detailed error information from the response
          response.json().then(data => {
            console.error('Failed to save user message:', data);
          }).catch(err => {
            console.error('Failed to save user message, could not parse error:', err);
          });
        } else {
          // Force refresh the chat history to update sidebar position
          historyService.invalidateCache();
        }
      } catch (error) {
        console.error('Error saving user message:', error);
      }
    }
  };

  // Wrap the original handleSubmit to save the user message first
  const handleSubmitWithSave = async (event?: { preventDefault?: (() => void) } | undefined, chatRequestOptions?: any) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    // Ensure session exists before trying to save messages
    try {
      // Call the session endpoint to make sure the session exists
      const sessionResponse = await fetch(`/api/chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id,
          agentId: selectedAgentId,
          deepSearchEnabled
        })
      });
      
      if (!sessionResponse.ok) {
        console.error('Error ensuring chat session exists:', await sessionResponse.text());
      }
      
      // Check if this is the first message in the conversation
      const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
      
      if (input.trim()) {
        await saveUserMessage(input);
        
        // Only update the title if this is the first message
        if (isFirstMessage) {
          // Get truncated title from first message
          const title = input.length > 30 
            ? `${input.substring(0, 30)}...` 
            : input;
            
          // Update the chat title
          fetch(`/api/chat/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title }),
          })
          .then(() => {
            // Get the current chat data to get the userId
            fetch(`/api/chat/${id}`)
              .then(res => res.json())
              .then(data => {
                // Invalidate history cache with the user ID
                if (data.userId) {
                  historyService.invalidateCache(data.userId);
                } else {
                  historyService.invalidateCache();
                }
              })
              .catch(err => {
                console.error('Error fetching chat data for cache invalidation:', err);
                // Fall back to invalidating without user ID
                historyService.invalidateCache();
              });
          })
          .catch(error => {
            console.error('Error updating chat title:', error);
          });
        }
      }
    } catch (error) {
      console.error('Failed to ensure chat session exists:', error);
    }
    
    return handleSubmit(event, chatRequestOptions);
  };

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

        <Artifact
          chatId={id}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmitWithSave}
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
