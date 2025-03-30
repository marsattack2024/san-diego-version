'use client';

import { ChatClient } from './chat-client';
import { use } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

export const dynamic = 'force-dynamic';

const log = clientLogger;

export default function ChatIdPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use to unwrap the Promise params
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  log.debug('Rendering chat with ID from URL', { id });

  return (
    <ChatClient chatId={id} />
  );
}