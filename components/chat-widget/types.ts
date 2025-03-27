import { type Message } from 'ai';

/**
 * Configuration options for the chat widget
 */
export interface ChatWidgetConfig {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  title?: string;
  primaryColor?: string;
  greeting?: string;
  placeholder?: string;
  width?: number;
  height?: number;
  bubbleIcon?: string; // URL to icon or emoji string
  maxMessages?: number;
}

/**
 * Chat widget session
 */
export interface ChatWidgetSession {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messages: Message[];
}

/**
 * Chat widget state
 */
export interface ChatWidgetState {
  isOpen: boolean;
  config: ChatWidgetConfig;
  session: ChatWidgetSession;
  isLoading: boolean;
  error: string | null;
}

/**
 * Widget API request body
 */
export interface WidgetChatRequest {
  message: string;
  sessionId: string;
}

/**
 * Widget API response
 */
export interface WidgetChatResponse {
  message: string;
  sessionId: string;
  status: 'success' | 'error';
  error?: string;
  rateLimitInfo?: {
    remaining: number;
    resetAt: number;
  };
}

/**
 * Widget position styles
 */
export const POSITION_STYLES = {
  'bottom-right': {
    bottom: '20px',
    right: '20px',
  },
  'bottom-left': {
    bottom: '20px',
    left: '20px',
  },
  'top-right': {
    top: '20px',
    right: '20px',
  },
  'top-left': {
    top: '20px',
    left: '20px',
  },
};

/**
 * Default widget configuration
 */
export const DEFAULT_CONFIG: ChatWidgetConfig = {
  position: 'bottom-right',
  title: 'Ask Marlan',
  primaryColor: '#0070f3',
  greeting: "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?",
  placeholder: 'Type your message...',
  width: 360,
  height: 500,
  maxMessages: 50,
}; 