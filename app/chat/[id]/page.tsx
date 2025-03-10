'use client';

import { Chat } from '@/components/chat';
import { ChatClient } from './chat-client';
import { useEffect } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

const log = clientLogger;

export default function ChatIdPage({ params }: { params: { id: string } }) {
  // Access the id directly from params
  const id = params.id;
  
  log.info('Rendering chat with ID from URL', { id });
  
  return (
    <ChatClient chatId={id} />
  );
}