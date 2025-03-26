import React, { createContext, useContext, useState, useEffect } from 'react'
import { ChatWidgetConfig, ChatWidgetState, DEFAULT_CONFIG } from './types'
import { getSession } from '@/lib/widget/session'

// Create context with default values
interface ChatWidgetContextValue {
  state: ChatWidgetState;
  toggleWidget: () => void;
  setConfig: (config: Partial<ChatWidgetConfig>) => void;
}

const ChatWidgetContext = createContext<ChatWidgetContextValue | undefined>(undefined)

export function useChatWidget() {
  const context = useContext(ChatWidgetContext)
  if (context === undefined) {
    throw new Error('useChatWidget must be used within a ChatWidgetProvider')
  }
  return context
}

interface ChatWidgetProviderProps {
  children: React.ReactNode
  initialConfig?: Partial<ChatWidgetConfig>
}

export function ChatWidgetProvider({ 
  children, 
  initialConfig = {} 
}: ChatWidgetProviderProps) {
  // Initialize state
  const [state, setState] = useState<ChatWidgetState>({
    isOpen: false,
    config: { ...DEFAULT_CONFIG, ...initialConfig },
    session: getSession(),
    isLoading: false,
    error: null
  })

  // Handle toggling the widget open/closed
  const toggleWidget = () => {
    setState(prevState => ({
      ...prevState,
      isOpen: !prevState.isOpen
    }))
  }

  // Update config
  const setConfig = (newConfig: Partial<ChatWidgetConfig>) => {
    setState(prevState => ({
      ...prevState,
      config: { ...prevState.config, ...newConfig }
    }))
  }

  // Provide context value
  const contextValue: ChatWidgetContextValue = {
    state,
    toggleWidget,
    setConfig
  }

  return (
    <ChatWidgetContext.Provider value={contextValue}>
      {children}
    </ChatWidgetContext.Provider>
  )
} 