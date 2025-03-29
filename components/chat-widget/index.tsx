'use client'

import { ChatWidgetConfig } from './types'
import { ChatWidgetV2 } from './chat-widget-v2'
import { useAppChat } from './use-app-chat'

interface ChatWidgetRootProps {
  config?: Partial<ChatWidgetConfig>
}

// Root component for external use
export function ChatWidgetRoot({ config = {} }: ChatWidgetRootProps) {
  return <ChatWidgetV2 config={config} />
}

// Re-export components and hooks for flexibility
export {
  ChatWidgetV2,
  useAppChat
}

// Export types
export * from './types' 