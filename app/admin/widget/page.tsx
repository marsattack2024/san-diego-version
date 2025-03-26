'use client';

import React, { useState, useEffect } from 'react';
import { ChatWidgetRoot, ChatWidgetProvider } from '@/components/chat-widget'
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

export default function AdminWidgetPage() {
  const [error, setError] = useState<Error | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Add client-side effect to log rendering and catch errors
  useEffect(() => {
    console.log('AdminWidgetPage: Component mounted');
    setIsLoaded(true);
    
    // Log when component unmounts
    return () => {
      console.log('AdminWidgetPage: Component unmounted');
    };
  }, []);

  return (
    <ChatWidgetProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Widget Management</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Configure the chat widget and generate embed codes for websites.
          </p>
        </div>
        
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error.message}
            </AlertDescription>
          </Alert>
        )}
        
        <div className="w-full">
          {isLoaded ? (
            <AdminWidgetConfigurator />
          ) : (
            <div className="py-4">Loading widget configurator...</div>
          )}
        </div>
        
        {/* The actual widget will appear based on configuration */}
        <ChatWidgetRoot />
      </div>
    </ChatWidgetProvider>
  )
} 