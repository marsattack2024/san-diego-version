'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
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
        
        // Look up the corresponding request messageId that triggered this response
        const previousUserMessage = messages.slice().reverse().find(m => m.role === 'user');
        const requestMessageId = previousUserMessage ? messageIdMap[previousUserMessage.id] : null;
        
        console.log('Saving assistant message with request ID:', { 
          requestMessageId, 
          hasUserMessage: !!previousUserMessage,
          userMessageId: previousUserMessage?.id
        });
        
        // Generate a fallback ID if no requestMessageId is found
        const messageId = requestMessageId || crypto.randomUUID();
        console.log('Saving assistant message with ID:', messageId);
        
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
            messageId // Consistent parameter name (was chatId)
          }),
        });
        
        if (response.ok) {
          // Store the chatId for this message
          const data = await response.json();
          const savedMessageId = data.messageId || messageId;
          
          setMessageIdMap(prev => ({
            ...prev,
            [message.id]: savedMessageId
          }));
          
          console.log('Successfully saved assistant message:', { 
            messageId: savedMessageId, 
            responseMessageId: message.id
          });
        } else {
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
      historyService.invalidateCache();
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

  // Wrap the original handleSubmit to save the user message first
  const handleSubmitWithSave = async (event?: { preventDefault?: (() => void) } | undefined, chatRequestOptions?: any) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    // Only proceed if there's input to send and not already loading
    if (!input.trim() || isLoading) {
      return;
    }
    
    try {
      console.log(`Creating chat session for ID: ${id}`);
      
      // Start AI processing immediately with the current input
      const currentInput = input; // Capture current input value
      
      // Call the AI endpoint immediately to reduce perceived latency
      // This will trigger the "thinking" indicator
      try {
        // Submit to AI immediately to show thinking indicator
        handleSubmit(undefined, chatRequestOptions);
      } catch (aiError) {
        console.error('Error in AI processing:', aiError);
        toast.error('An error occurred while processing your message.');
      }
      
      // Run session creation and message saving in parallel (non-blocking)
      const saveOperationsPromise: Promise<void> = (async () => {
        // Add timeout and retry logic for session creation
        let sessionResponse = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            // Call the session endpoint to make sure the session exists FIRST
            // with a timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            sessionResponse = await fetch(`/api/chat/session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                id,
                agentId: selectedAgentId,
                deepSearchEnabled
              }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (sessionResponse.ok) {
              break; // Success, exit retry loop
            } else {
              console.warn(`Session creation attempt ${retryCount + 1} failed with status: ${sessionResponse.status}`);
              retryCount++;
              
              if (retryCount < maxRetries) {
                // Wait before retrying (exponential backoff)
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)));
              }
            }
          } catch (fetchError) {
            console.error(`Session creation fetch error (attempt ${retryCount + 1}):`, fetchError);
            retryCount++;
            
            if (retryCount < maxRetries) {
              // Wait before retrying
              await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)));
            }
          }
        }
        
        // Check if we eventually succeeded
        if (!sessionResponse || !sessionResponse.ok) {
          const errorText = sessionResponse ? await sessionResponse.text() : 'Network error';
          console.error('Error ensuring chat session exists after retries:', errorText);
          toast.error('Failed to create chat session. Please try again.');
          return;
        }
        
        const sessionData = await sessionResponse.json();
        console.log('Session creation response:', sessionData);
        
        // Check if this is the first message in the conversation to update title
        const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;

        console.log('Is first message:', isFirstMessage, 'User message count:', messages.filter(m => m.role === 'user').length);
        
        // Generate a consistent message ID for tracking
        const messageId = crypto.randomUUID();
        console.log(`Creating message with ID: ${messageId}`);
        
        // Add retry logic for saving the user message
        let messageResponse = null;
        retryCount = 0;
        
        while (retryCount < maxRetries) {
          try {
            // Save the user message to Supabase BEFORE sending to AI
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            console.log('Sending user message save request', {
              endpoint: `/api/chat/${id}`,
              method: 'POST',
              messageRole: 'user',
              contentLength: currentInput.length,
              messageId,
              timestamp: new Date().toISOString()
            });

            messageResponse = await fetch(`/api/chat/${id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  role: 'user',
                  content: currentInput,
                },
                messageId, // Use consistent parameter naming (was chatId in some places)
                updateTimestamp: true, // Signal to update the session timestamp
              }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (messageResponse.ok) {
              // Get a copy of the response text but don't consume the original response
              const responseText = await messageResponse.clone().text();
              console.log(`Message save request succeeded with status: ${messageResponse.status}`, {
                responseText,
                timestamp: new Date().toISOString()
              });

              // Attempt to parse the response as JSON for more detailed logging
              try {
                const jsonResponse = JSON.parse(responseText);
                console.log('Parsed message save response:', {
                  success: jsonResponse.success,
                  messageId: jsonResponse.messageId,
                  responseDetails: jsonResponse,
                  timestamp: new Date().toISOString()
                });
              } catch (parseError) {
                console.warn('Could not parse response as JSON:', parseError);
              }
              
              break; // Success, exit retry loop
            } else {
              console.warn(`Message save attempt ${retryCount + 1} failed with status: ${messageResponse.status}`, {
                statusText: messageResponse.statusText,
                timestamp: new Date().toISOString()
              });
              
              // Try to get the response text for better debugging
              try {
                const errorText = await messageResponse.clone().text();
                console.error('Error response text:', errorText);
                
                // Attempt to parse error as JSON for more details
                try {
                  const jsonError = JSON.parse(errorText);
                  console.error('Parsed error details:', {
                    error: jsonError.error,
                    details: jsonError.details,
                    code: jsonError.code,
                    fullError: jsonError
                  });
                } catch (jsonError) {
                  // Not JSON, continue with text
                }
              } catch (e) {
                console.error('Could not read error response text:', e);
              }
              
              retryCount++;
              
              if (retryCount < maxRetries) {
                // Wait before retrying (exponential backoff)
                const delay = 500 * Math.pow(2, retryCount);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
              }
            }
          } catch (fetchError) {
            console.error(`Message save fetch error (attempt ${retryCount + 1}):`, fetchError);
            retryCount++;
            
            if (retryCount < maxRetries) {
              // Wait before retrying
              await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)));
            }
          }
        }
        
        // Get full response to debug
        let messageData: any;
        let responseText: string;
        
        try {
          responseText = await messageResponse?.text() || 'No response';
          console.log('Raw message save response:', responseText);
          
          try {
            messageData = JSON.parse(responseText);
          } catch (e) {
            console.error('Failed to parse message response as JSON:', e);
            messageData = { error: 'Failed to parse response' };
          }
        } catch (e) {
          console.error('Failed to read message response text:', e);
          responseText = 'Failed to read response text';
        }
        
        if (!messageResponse?.ok) {
          console.error('Failed to save user message:', {
            statusCode: messageResponse?.status,
            statusText: messageResponse?.statusText,
            responseData: messageData,
            responseText
          });
          
          // Continue anyway - don't block the AI response
          return;
        }
        
        // Log success with detailed information
        console.log('Message save successful:', {
          response: messageData,
          statusCode: messageResponse.status,
          messageId: messageData?.messageId || messageId
        });
        
        // Store the message ID for the next user message that will be appended to state
        const actualMessageId = messageData?.messageId || messageId;
        
        // Try to find if the message is already in state (optimistic update)
        const userMessage = messages.find(m => m.role === 'user' && m.content === currentInput);
        if (userMessage) {
          // If found, update the mapping for the existing message
          console.log('Found existing user message in state, updating mapping:', userMessage.id, '->', actualMessageId);
          
          setMessageIdMap(prev => ({
            ...prev,
            [userMessage.id]: actualMessageId
          }));
        } else {
          console.log('No matching user message found in state yet, will update when added');
          
          // Create a function to update the mapping when the message is added
          const handleNewMessage = () => {
            // Find the newly added user message by checking what messages don't have an ID mapping
            const newMessages = messages.filter(m => 
              m.role === 'user' && 
              m.content === currentInput && 
              !messageIdMap[m.id]
            );
            
            if (newMessages.length > 0) {
              console.log('Found new user messages, updating mapping:', newMessages.map(m => m.id));
              
              // Update the message ID map for all matching messages
              const updates = newMessages.reduce((acc, msg) => ({
                ...acc,
                [msg.id]: actualMessageId
              }), {});
              
              setMessageIdMap(prev => ({
                ...prev,
                ...updates
              }));
            }
          };
          
          // Call immediately and set a fallback timeout
          handleNewMessage();
          setTimeout(handleNewMessage, 500);
        }
        
        // Update the title if this is the first message
        if (isFirstMessage) {
          try {
            // Get truncated title from first message
            const title = currentInput.length > 30 
              ? `${currentInput.substring(0, 30)}...` 
              : currentInput;
              
              console.log(`Updating chat title to: "${title}"`);
              
              // Update the chat title
              const titleResponse = await fetch(`/api/chat/${id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title }),
              });
              
              // Get the full response text for debugging
              const titleResponseText = await titleResponse.text();
              console.log('Title update raw response:', titleResponseText);
              
              // Parse the response text as JSON
              let titleData;
              try {
                titleData = JSON.parse(titleResponseText);
                console.log('Parsed title response:', titleData);
              } catch (parseError) {
                console.error('Failed to parse title response as JSON:', parseError);
              }
              
              if (!titleResponse.ok) {
                throw new Error(`Failed to update title: ${titleResponse.status} - ${titleResponseText}`);
              }
              
              console.log('Successfully updated chat title');
              
              // Update local state as well
              updateConversationMetadata(id, { title });
              
              // Force refresh the chat history to show updated title
              historyService.invalidateCache();
          } catch (titleError) {
            console.error('Error updating chat title:', titleError);
            // Still invalidate the cache to refresh the history
            historyService.invalidateCache();
          }
        }
      })();
      
      // Log any errors in the background save operations but don't block UI
      saveOperationsPromise.catch((error: Error) => {
        console.error('Error in background save operations:', error);
      });

      return;
    } catch (error) {
      console.error('Error in handleSubmitWithSave:', error);
      toast.error('An error occurred. Please try again.');
    }
  };

  // Remove separate votes SWR request as we'll now get vote data directly from chat messages
  /* 
  const { data: votes, error: voteError } = useSWR<Array<Vote>>(
    id ? `/api/vote?chatId=${id}` : null, // Only fetch if we have an ID
    fetcher,
    {
      // Add additional options for SWR
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 30000, // Only poll every 30 seconds instead of continuously
      dedupingInterval: 30000, // Dedupe calls within 30 seconds
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
  */

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
      <div className="flex flex-col bg-primary-foreground h-full overflow-hidden">
        {!isReadonly && (
          <ChatHeader
            chatId={id}
            isReadonly={isReadonly}
            title={'New chat'}
            isLoading={isLoading}
          />
        )}
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
