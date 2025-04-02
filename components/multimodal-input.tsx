'use client';

import type {
  Attachment,
  ChatRequestOptions,
  CreateMessage,
  Message,
} from 'ai';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';

import { sanitizeUIMessages } from '@/lib/utils';

import { ArrowUpIcon, MagnifyingGlassIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import { useChatStore } from '@/stores/chat-store';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { AgentSelector } from './agent-selector';

const PureMultimodalInput = ({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
}: {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  handleSubmit: (
    event?: {
      preventDefault?: () => void;
    },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  className?: string;
}) => {
  // Define constants for height values - moved to CSS variables
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const setDeepSearchEnabled = useChatStore(state => state.setDeepSearchEnabled);

  // Simplified height adjustment function with useCallback
  const adjustHeight = useCallback(() => {
    if (!textareaRef.current) return;

    // Reset height to auto to properly calculate scrollHeight
    textareaRef.current.style.height = 'auto';

    // Calculate new height based on content
    const newHeight = Math.min(
      Math.max(textareaRef.current.scrollHeight, 115),
      360
    );

    textareaRef.current.style.height = `${newHeight}px`;
  }, []);

  // Simpler reset height function
  const resetHeight = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '115px';
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    'input',
    '',
  );

  // Initialization effect
  useEffect(() => {
    if (!textareaRef.current) return;

    // Initial value setup
    const finalValue = textareaRef.current.value || localStorageInput || '';
    setInput(finalValue);

    // Initial height setup with slight delay to ensure proper calculation
    requestAnimationFrame(() => {
      adjustHeight();

      // Add smooth transition after initial render
      if (textareaRef.current) {
        textareaRef.current.style.transition = 'height 0.1s ease-out';
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle autofocus separately
  useEffect(() => {
    if (width && width >= 768) {
      const timeoutId = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [width]);

  // Update local storage when input changes
  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  // Monitor input changes for height adjustment
  useEffect(() => {
    if (input === '') {
      resetHeight();
    } else {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(adjustHeight);
    }
  }, [input, adjustHeight, resetHeight]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const submitForm = useCallback(() => {
    if (!input.trim() && !attachments.length) return;

    window.history.replaceState({}, '', `/chat/${chatId}`);

    handleSubmit(undefined, {
      experimental_attachments: attachments,
    });

    // Clear form state
    setAttachments([]);
    setInput('');
    setLocalStorageInput('');

    // Reset height
    resetHeight();

    // Focus the textarea on desktop
    if (width && width >= 768) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [
    input,
    attachments,
    handleSubmit,
    setAttachments,
    setInput,
    setLocalStorageInput,
    resetHeight,
    chatId,
    width,
  ]);

  // Clean input handler
  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, [setInput]);

  // Key down handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      if (isLoading) {
        toast.error('Please wait for the model to finish its response!');
      } else {
        submitForm();
      }
    }
  }, [isLoading, submitForm]);

  // Simplified resize observer with debounce
  useEffect(() => {
    if (!textareaRef.current) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          const isPartiallyOffscreen = rect.bottom > window.innerHeight;

          if (isPartiallyOffscreen) {
            textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      }, 100); // Debounce resize events
    });

    resizeObserver.observe(textareaRef.current);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType: contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (error) {
      toast.error('Failed to upload file, please try again!');
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined,
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error('Error uploading files!', error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          data-testid="attachments-preview"
          className="flex flex-row gap-2 overflow-x-auto items-end"
        >
          {attachments.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: '',
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      <div className="relative w-full rounded-2xl border dark:border-zinc-700 bg-muted">
        <Textarea
          data-testid="multimodal-input"
          ref={textareaRef}
          placeholder="Send a message..."
          value={input}
          onChange={handleInput}
          className={cx(
            // Remove conflicting Tailwind height classes and use a custom class instead
            'chat-input-textarea',
            'w-full resize-none overflow-y-auto',
            'bg-transparent px-4 pb-12 pt-3 border-none !text-base',
            className,
          )}
          rows={1}
          autoFocus
          onKeyDown={handleKeyDown}
        />

        {deepSearchEnabled && (
          <div className="absolute right-14 top-[15px] text-xs text-muted-foreground flex items-center">
            <MagnifyingGlassIcon size={12} className="mr-1" />
            {isLoading ? (
              <span className="flex items-center">
                <span className="mr-1">DeepSearching</span>
                <span className="inline-flex">
                  <span className="deepsearch-dot deepsearch-dot-1">.</span>
                  <span className="deepsearch-dot deepsearch-dot-2">.</span>
                  <span className="deepsearch-dot deepsearch-dot-3">.</span>
                </span>
              </span>
            ) : (
              <span className="sr-only">DeepSearch enabled</span>
            )}
          </div>
        )}

        {/* Make sure the controls always stay at the bottom of the input area */}
        <div className="absolute bottom-0 left-0 right-0 px-4 py-2 flex justify-between items-center bg-muted rounded-b-2xl">
          <div className="flex items-center gap-2">
            <AgentSelector className="h-10" />
            <DeepSearchButton
              deepSearchEnabled={deepSearchEnabled}
              setDeepSearchEnabled={setDeepSearchEnabled}
              isLoading={isLoading}
            />
          </div>

          <div className="flex">
            {isLoading ? (
              <StopButton
                stop={stop}
                setMessages={setMessages}
              />
            ) : (
              <SendButton
                submitForm={submitForm}
                input={input}
                uploadQueue={uploadQueue}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Restore memoization
export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;

    return true;
  },
);

function PureDeepSearchButton({
  deepSearchEnabled,
  setDeepSearchEnabled,
  isLoading,
}: {
  deepSearchEnabled: boolean;
  setDeepSearchEnabled: (enabled: boolean) => void;
  isLoading: boolean;
}) {
  // Add debug log when component renders
  console.info('[DeepSearchButton] Rendering with state:', {
    deepSearchEnabled,
    type: typeof deepSearchEnabled,
    stringValue: String(deepSearchEnabled),
    booleanValue: Boolean(deepSearchEnabled),
    timestamp: new Date().toISOString()
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="deep-search-button"
          className={`h-10 ${deepSearchEnabled ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            // Explicitly cast to boolean with extra safeguards
            const newValue = !deepSearchEnabled;
            // Add extra debug logging
            console.info('[DeepSearchButton] Setting new toggle state:', {
              oldValue: deepSearchEnabled,
              oldValueType: typeof deepSearchEnabled,
              newValue: newValue,
              newValueType: typeof newValue,
              booleanCast: Boolean(newValue),
              timestamp: new Date().toISOString()
            });
            setDeepSearchEnabled(Boolean(newValue));

            // Verify the state was updated after a short delay
            setTimeout(() => {
              const currentState = useChatStore.getState().deepSearchEnabled;
              console.info('[DeepSearchButton] State after update:', {
                storeValue: currentState,
                storeValueType: typeof currentState,
                timestamp: new Date().toISOString()
              });
            }, 100);
          }}
          disabled={isLoading}
          variant={deepSearchEnabled ? "default" : "outline"}
          size="sm"
        >
          <MagnifyingGlassIcon size={16} className="mr-1" />
          <span className="text-sm font-medium">Deep Search</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {deepSearchEnabled
          ? "Disable DeepSearch"
          : "Enable DeepSearch: Get comprehensive research on your queries"}
      </TooltipContent>
    </Tooltip>
  );
}

const DeepSearchButton = memo(PureDeepSearchButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
}) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-2 h-10 w-10 border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => sanitizeUIMessages(messages));
      }}
    >
      <StopIcon size={16} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: React.MouseEvent) => {
    event.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);

    submitForm();

    setTimeout(() => {
      setIsSubmitting(false);
    }, 1000);
  };

  return (
    <Button
      data-testid="send-button"
      className={cx(
        "rounded-full p-2 h-10 w-10 border dark:border-zinc-600 transition-all duration-200 hover:scale-115",
        isSubmitting && "opacity-70"
      )}
      onClick={handleSubmit}
      disabled={input.length === 0 || uploadQueue.length > 0 || isSubmitting}
    >
      <ArrowUpIcon size={16} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});
