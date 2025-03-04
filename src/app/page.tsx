import { Metadata } from 'next';
import { ChatInterface } from '../components/chat/chat-interface';

export const metadata: Metadata = {
  title: 'AI Chat Interface - Multi-Agent System',
  description: 'A multi-agent chat system with specialized agents for different domains',
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">AI Chat Interface</h1>
        <p className="text-center mb-8 text-lg">
          Interact with specialized AI agents for different domains
        </p>
        
        <div className="w-full h-[70vh] border border-gray-300 rounded-lg overflow-hidden">
          <ChatInterface />
        </div>
      </div>
    </main>
  );
} 