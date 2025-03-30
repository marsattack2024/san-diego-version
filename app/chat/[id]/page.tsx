'use client';

import { ChatClient } from './chat-client';
import { clientLogger } from '@/lib/logger/client-logger';

export const dynamic = 'force-dynamic';

const log = clientLogger;

export default function ChatIdPage({ params }: { params: { id: string } }) {
  const id = params.id;

  log.debug('Rendering chat with ID from URL', { id });

  return (
    <ChatClient chatId={id} />
  );
}