import { Metadata } from 'next'
import { ChatWidgetRoot } from '@/components/chat-widget'
import WidgetConfigurator from './widget-configurator'

export const metadata: Metadata = {
  title: 'Chat Widget Demo',
  description: 'A configurable chat widget that integrates with your knowledge base',
}

export default function WidgetDemoPage() {
  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Chat Widget Demo</h1>
      
      <div className="grid grid-cols-1 gap-8 mb-8">
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Widget Configuration</h2>
          <p className="text-gray-500 mb-6">
            Customize the chat widget appearance and behavior. Changes will be reflected in the live preview.
          </p>
          
          <WidgetConfigurator />
        </div>
      </div>
      
      {/* The ChatWidgetRoot component will render the widget */}
      <ChatWidgetRoot />
    </div>
  )
} 