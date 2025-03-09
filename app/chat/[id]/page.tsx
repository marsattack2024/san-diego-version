'use client';

import { Chat } from '@/components/chat';
import { ChatClient } from './chat-client';
import { useEffect } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';
import { use } from 'react';

const log = clientLogger;

export default function ChatIdPage({ params }: { params: { id: string } }) {
  // Properly unwrap params using React.use() as required by Next.js
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;
  
  log.info('Rendering chat with ID from URL', { id });
  
  return (
    <ChatClient chatId={id} />
  );
}