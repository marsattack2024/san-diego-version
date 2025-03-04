import { ChatInterface } from '@/components/chat/chat-interface';
import { siteConfig } from '@/config/site';
import Link from 'next/link';

export const metadata = {
  title: `Chat | ${siteConfig.name}`,
  description: 'Chat with our AI assistant',
};

export default function ChatPage() {
  return (
    <div className="container mx-auto py-4 h-[calc(100vh-4rem)]">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">AI Chat</h1>
        <Link 
          href="/enhanced-chat" 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Try Enhanced Chat
        </Link>
      </div>
      <ChatInterface />
    </div>
  );
}

