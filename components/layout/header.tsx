'use client';

import { useState } from 'react';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { Button } from '@/components/ui/button';
import { ChatHistory } from './chat-history';

export function Header() {
  const [showHistory, setShowHistory] = useState(false);
  
  return (
    <header className="border-b">
      <div className="container mx-auto h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/chat" className="font-bold text-xl">
            {siteConfig.name}
          </Link>
        </div>
        
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            onClick={() => setShowHistory(!showHistory)}
          >
            Chat History
          </Button>
        </div>
        
        {showHistory && <ChatHistory />}
      </div>
    </header>
  );
}

