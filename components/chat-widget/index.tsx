'use client'

import { ChatWidgetConfig } from './types'
import { ChatWidget } from './chat-widget'
import { ChatWidgetProvider, useChatWidget } from './chat-widget-provider'

interface ChatWidgetRootProps {
  config?: Partial<ChatWidgetConfig>
}

// Root component for external use
export function ChatWidgetRoot({ config = {} }: ChatWidgetRootProps) {
  return (
    <ChatWidgetProvider initialConfig={config}>
      <ChatWidget />
    </ChatWidgetProvider>
  )
}

// Re-export components and hooks for flexibility
export {
  ChatWidget,
  ChatWidgetProvider,
  useChatWidget
}

// Export types
export * from './types' 