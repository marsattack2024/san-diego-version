import { Metadata } from 'next'
import { ChatWidgetRoot, ChatWidgetProvider } from '@/components/chat-widget'
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator'

export const metadata: Metadata = {
  title: 'Widget Management',
  description: 'Configure and manage the embedding of the Marlin chat widget',
}

export default function AdminWidgetPage() {
  return (
    <ChatWidgetProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Widget Management</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Configure the chat widget and generate embed codes for websites.
          </p>
        </div>
        
        <div className="w-full">
          <AdminWidgetConfigurator />
        </div>
        
        {/* The actual widget will appear based on configuration */}
        <ChatWidgetRoot />
      </div>
    </ChatWidgetProvider>
  )
} 