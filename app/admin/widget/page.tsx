'use client';

import React, { useState, useEffect } from 'react';
import { toast } from '@/components/toast';
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator';
import { ChatWidgetProvider } from '@/components/chat-widget/chat-widget-provider';

// Force dynamic rendering for this admin page
export const dynamic = "force-dynamic";

export default function AdminWidgetPage() {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());

  // Remove all admin verification state and API test
  // The middleware handles admin verification for all admin pages

  return (
    <div className="space-y-6 p-6 border rounded-md">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure and manage your chat widget
        </p>
      </div>

      {/* Widget Configurator */}
      <ChatWidgetProvider>
        <AdminWidgetConfigurator />
      </ChatWidgetProvider>

      <div className="border rounded-md p-4 bg-slate-50">
        <p><strong>Current Time:</strong> {timestamp}</p>
        <p><strong>Environment:</strong> {process.env.NODE_ENV}</p>
        <button
          className="px-4 py-2 mt-2 bg-blue-500 text-white rounded-md"
          onClick={() => {
            console.log('Update timestamp clicked in widget page');
            setTimestamp(new Date().toISOString());
            toast({
              title: "Timestamp updated",
              description: "Current time has been refreshed."
            });
          }}
        >
          Update Timestamp
        </button>
      </div>
    </div>
  );
}