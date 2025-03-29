'use client';

import React, { useState } from 'react';
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator';
import { ChatWidgetV2 } from '@/components/chat-widget';
import { ChatWidgetConfig, DEFAULT_CONFIG } from '@/components/chat-widget/types';

// Force dynamic rendering for this admin page
export const dynamic = "force-dynamic";

export default function AdminWidgetPage() {
  const [config, setConfig] = useState<ChatWidgetConfig>({ ...DEFAULT_CONFIG });

  const handleConfigUpdate = (newConfig: Partial<ChatWidgetConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  return (
    <div className="space-y-6 p-6 border rounded-md w-full max-w-full overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure and manage your chat widget
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Widget Configuration</h2>
        <AdminWidgetConfigurator
          config={config}
          onConfigChange={handleConfigUpdate}
        />
      </div>

      {/* The widget will appear at its natural position based on config */}
      <ChatWidgetV2 config={config} />
    </div>
  );
}