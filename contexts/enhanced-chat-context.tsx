'use client';

import React, { createContext, useContext } from 'react';

// Define the context type
export interface EnhancedChatContextType {
  loadConversation?: (conversationId: string) => void;
}

// Create the context with a default value
export const EnhancedChatContext = createContext<EnhancedChatContextType>({
  loadConversation: undefined,
});

// Create a provider component
export interface EnhancedChatProviderProps {
  children: React.ReactNode;
  value: EnhancedChatContextType;
}

export function EnhancedChatProvider({ children, value }: EnhancedChatProviderProps) {
  return (
    <EnhancedChatContext.Provider value={value}>
      {children}
    </EnhancedChatContext.Provider>
  );
}

// Create a hook to use the context
export function useEnhancedChatContext() {
  return useContext(EnhancedChatContext);
} 