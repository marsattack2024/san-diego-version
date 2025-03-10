'use client';

import { Chat } from '@/components/chat';
import { ChatClient } from './chat-client';
import { useEffect } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';
import { use } from 'react';

const log = clientLogger;

export default function ChatIdPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use to unwrap the Promise params
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  log.info('Rendering chat with ID from URL', { id });
  
  return (
    <ChatClient chatId={id} />
  );
}