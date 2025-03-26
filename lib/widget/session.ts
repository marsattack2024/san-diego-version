import { type Message } from 'ai';
import { type ChatWidgetSession } from '@/components/chat-widget/types';

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Create a new session
 */
export function createSession(): ChatWidgetSession {
  const now = Date.now();
  return {
    id: generateSessionId(),
    createdAt: now,
    lastActiveAt: now,
    messages: [],
  };
}

/**
 * Get the current session from localStorage or create a new one
 */
export function getSession(): ChatWidgetSession {
  if (typeof window === 'undefined') {
    return createSession();
  }

  try {
    const storedSession = localStorage.getItem('chat-widget-session');
    if (storedSession) {
      const session = JSON.parse(storedSession) as ChatWidgetSession;
      // Check if the session is expired (24 hours)
      const now = Date.now();
      const expiryTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      if (now - session.lastActiveAt > expiryTime) {
        // Session expired, create a new one
        const newSession = createSession();
        saveSession(newSession);
        return newSession;
      }
      
      // Update last active time
      session.lastActiveAt = now;
      saveSession(session);
      return session;
    }
  } catch (error) {
    console.error('Error getting chat widget session:', error);
  }

  // Create a new session if none exists or there was an error
  const newSession = createSession();
  saveSession(newSession);
  return newSession;
}

/**
 * Save the session to localStorage
 */
export function saveSession(session: ChatWidgetSession): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem('chat-widget-session', JSON.stringify(session));
  } catch (error) {
    console.error('Error saving chat widget session:', error);
  }
}

/**
 * Update the session with a new message
 */
export function addMessageToSession(session: ChatWidgetSession, message: Message): ChatWidgetSession {
  const updatedSession = {
    ...session,
    lastActiveAt: Date.now(),
    messages: [...session.messages, message],
  };
  
  saveSession(updatedSession);
  return updatedSession;
}

/**
 * Clear the current session
 */
export function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem('chat-widget-session');
  } catch (error) {
    console.error('Error clearing chat widget session:', error);
  }
} 