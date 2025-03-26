import { useState, useEffect, useRef } from 'react'
import { useChat } from 'ai/react'
import { Message } from 'ai'
import { X, Send, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  ChatWidgetConfig, 
  ChatWidgetSession, 
  POSITION_STYLES, 
  DEFAULT_CONFIG 
} from './types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  getSession, 
  saveSession, 
  addMessageToSession,
  clearSession 
} from '@/lib/widget/session'

interface ChatWidgetProps {
  config?: Partial<ChatWidgetConfig>
}

export function ChatWidget({ config = {} }: ChatWidgetProps) {
  // Merge default config with provided config
  const widgetConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Widget state
  const [isOpen, setIsOpen] = useState(false)
  const [session, setSession] = useState<ChatWidgetSession | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // AI chat hook
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/widget-chat',
    id: session?.id,
    body: ({ messages }: { messages: Message[] }) => {
      // Get the last user message if any
      const lastMessage = messages[messages.length - 1]?.content || input
      return {
        message: lastMessage,
        sessionId: session?.id
      }
    },
    onResponse: (response) => {
      // Extract any headers we need
      const sessionId = response.headers.get('x-session-id')
      if (sessionId && session) {
        setSession({
          ...session,
          id: sessionId
        })
      }
    },
    onFinish: (message) => {
      if (session) {
        const updatedSession = addMessageToSession(session, message)
        setSession(updatedSession)
      }
    }
  })
  
  // Initialize session on mount
  useEffect(() => {
    const currentSession = getSession()
    setSession(currentSession)
  }, [])

  // Update messages from session on mount
  useEffect(() => {
    if (session && session.messages.length > 0) {
      // The useChat hook will handle the messages
    }
  }, [session])

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen])

  // Focus input when opening the widget
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Handle form submission
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (!input.trim() || !session) return
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input
    }
    
    const updatedSession = addMessageToSession(session, userMessage)
    setSession(updatedSession)
    
    handleSubmit(e)
  }

  // Reset the chat
  const handleReset = () => {
    clearSession()
    const newSession = getSession()
    setSession(newSession)
  }

  // Toggle the widget open/closed
  const toggleWidget = () => {
    setIsOpen(prev => !prev)
  }

  // Position styles based on config
  const positionStyle = POSITION_STYLES[widgetConfig.position || 'bottom-right']

  // Dynamic styles
  const primaryColorStyle = widgetConfig.primaryColor
    ? { '--widget-primary-color': widgetConfig.primaryColor } as React.CSSProperties
    : {}

  // Combine all styles
  const widgetStyle = {
    ...positionStyle,
    ...primaryColorStyle,
  }

  return (
    <div 
      className="fixed z-50 font-sans"
      style={widgetStyle}
    >
      {/* Chat bubble */}
      {!isOpen && (
        <button
          className="flex items-center justify-center w-14 h-14 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-300"
          style={{ backgroundColor: widgetConfig.primaryColor || '#0070f3' }}
          onClick={toggleWidget}
          aria-label="Open chat widget"
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div 
          className="flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden transition-all duration-300 animate-in fade-in-50 slide-in-from-bottom-10"
          style={{ 
            width: `${widgetConfig.width}px`, 
            height: `${widgetConfig.height}px` 
          }}
        >
          {/* Header */}
          <div 
            className="flex items-center justify-between p-4 border-b"
            style={{ backgroundColor: widgetConfig.primaryColor || '#0070f3' }}
          >
            <h3 className="font-medium text-white">
              {widgetConfig.title || 'Chat Widget'}
            </h3>
            <button
              className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
              onClick={toggleWidget}
              aria-label="Close chat widget"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea 
            className="flex-1 p-4 overflow-y-auto"
            ref={scrollRef}
          >
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500">
                  {widgetConfig.greeting || 'Hello! How can I help you today?'}
                </p>
              </div>
            )}

            {/* Chat messages */}
            <div className="space-y-4">
              {messages.map(message => (
                <div 
                  key={message.id} 
                  className={cn(
                    "flex max-w-[80%] rounded-lg p-3",
                    message.role === 'user' 
                      ? "ml-auto bg-blue-100 text-gray-800" 
                      : "bg-gray-100 text-gray-800"
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm break-words">
                    {message.content}
                  </p>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex max-w-[80%] rounded-lg p-3 bg-gray-100">
                  <p className="text-gray-500 animate-pulse">Thinking...</p>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex max-w-[80%] rounded-lg p-3 bg-red-100 text-red-800">
                  <p className="text-sm">Error: {error.message || "Something went wrong"}</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input area */}
          <form onSubmit={onSubmit} className="p-4 border-t">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                placeholder={widgetConfig.placeholder || "Type your message..."}
                className="resize-none min-h-[60px] max-h-[120px] flex-1"
                rows={1}
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const form = e.currentTarget.form
                    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
                  }
                }}
              />
              <Button 
                type="submit" 
                disabled={isLoading || !input.trim()} 
                className="self-end"
                style={{ 
                  backgroundColor: widgetConfig.primaryColor || '#0070f3',
                  color: 'white'
                }}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
} 