'use client';

import React from 'react';
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator';
import { ChatWidgetProvider } from '@/components/chat-widget/chat-widget-provider';
import { ChatWidget } from '@/components/chat-widget/chat-widget';

// Force dynamic rendering for this admin page
export const dynamic = "force-dynamic";

export default function AdminWidgetPage() {
  return (
    <div className="space-y-6 p-6 border rounded-md w-full max-w-full overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure and manage your chat widget
        </p>
      </div>

      {/* Widget Configurator with Live Preview */}
      <ChatWidgetProvider>
        <div className="w-full max-w-full overflow-hidden">
          <AdminWidgetConfigurator />
          <ChatWidget />
        </div>
      </ChatWidgetProvider>
    </div>
  );
}