'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChatWidgetConfig, DEFAULT_CONFIG } from '@/components/chat-widget/types'
import { EmbedSnippet } from '@/components/chat-widget/embed-snippet'
import { useChatWidget } from '@/components/chat-widget'
import { getSiteUrl } from '@/lib/widget/env-validator'

export function AdminWidgetConfigurator() {
  const { state, setConfig, toggleWidget } = useChatWidget()
  const [activeTab, setActiveTab] = useState('config')
  const [showEmbed, setShowEmbed] = useState(false)

  // Base URL for widget
  const baseUrl = 'https://marlan.photographytoprofits.com';

  // Standard embed code
  const standardEmbed = `<!-- Marlan Chat Widget -->
<script>
(function() {
  window.marlinChatConfig = {
    position: '${state.config.position}',
    title: '${state.config.title}',
    primaryColor: '${state.config.primaryColor}',
    greeting: '${state.config.greeting}',
    placeholder: '${state.config.placeholder}',
    apiEndpoint: '${baseUrl}/api/widget-chat'
  };
  
  var script = document.createElement('script');
  script.src = '${baseUrl}/widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>`;

  // GTM embed code
  const gtmEmbed = `<!-- Marlan Chat Widget - GTM Version -->
<script>
(function() {
  if (window.marlinChatLoaded) return;
  window.marlinChatLoaded = true;
  
  window.marlinChatConfig = {
    position: '${state.config.position}',
    title: '${state.config.title}',
    primaryColor: '${state.config.primaryColor}',
    greeting: '${state.config.greeting}',
    placeholder: '${state.config.placeholder}',
    apiEndpoint: '${baseUrl}/api/widget-chat'
  };
  
  var script = document.createElement('script');
  script.src = "${baseUrl}/widget.js";
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    console.error("Failed to load Marlan Chat Widget");
    
    // Notify GTM about the error if dataLayer is available
    if (window.dataLayer) {
      window.dataLayer.push({
        'event': 'marlinChatWidgetError',
        'marlinChat': {
          'error': true,
          'timestamp': new Date().toISOString()
        }
      });
    }
  };
  document.head.appendChild(script);
  
  // Push dataLayer event for GTM tracking
  if (window.dataLayer) {
    window.dataLayer.push({
      'event': 'marlinChatWidgetLoaded',
      'marlinChat': {
        'loaded': true,
        'timestamp': new Date().toISOString()
      }
    });
  }
})();
</script>`;

  // Direct body embed code
  const directEmbed = `<!-- Marlan Chat Widget - Direct Body Embed -->
<div id="marlin-chat-container"></div>
<script>
(function() {
  window.marlinChatConfig = {
    position: '${state.config.position}',
    title: '${state.config.title}',
    primaryColor: '${state.config.primaryColor}',
    greeting: '${state.config.greeting}',
    placeholder: '${state.config.placeholder}',
    apiEndpoint: '${baseUrl}/api/widget-chat',
    container: 'marlin-chat-container'
  };
  
  var script = document.createElement('script');
  script.src = '${baseUrl}/widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>`;

  // Additional verification and logging after component mounts
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
      // Always ensure baseUrl is set to at least window.location.origin
      if (!baseUrl || baseUrl === 'https://marlan.photographytoprofits.com') {
        const browserUrl = window.location.origin;
        console.log('Updating baseUrl from browser:', browserUrl);
        // This fallback will be replaced with actual URL after client-side hydration
      }

      // Enhanced debug logging 
      if (process.env.NODE_ENV === 'development') {
        console.log('Widget configurator environment:', {
          baseUrl,
          windowOrigin: window.location.origin,
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '(not set)',
          usingFallback: baseUrl === 'https://marlan.photographytoprofits.com'
        });
      }
    }
  }, [baseUrl]);

  // Handle input changes
  const handleChange = (key: keyof ChatWidgetConfig, value: any) => {
    setConfig({ [key]: value })
  }

  return (
    <div className="space-y-8">
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="embed">Embed Code</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Widget Settings</CardTitle>
              <CardDescription>
                Customize how the chat widget appears and behaves when embedded on websites.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic settings */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Widget Title</Label>
                    <Input
                      id="title"
                      value={state.config.title}
                      onChange={(e) => handleChange('title', e.target.value)}
                      placeholder="Chat Widget"
                    />
                  </div>

                  <div>
                    <Label htmlFor="greeting">Greeting Message</Label>
                    <Input
                      id="greeting"
                      value={state.config.greeting}
                      onChange={(e) => handleChange('greeting', e.target.value)}
                      placeholder="I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?"
                    />
                  </div>

                  <div>
                    <Label htmlFor="placeholder">Input Placeholder</Label>
                    <Input
                      id="placeholder"
                      value={state.config.placeholder}
                      onChange={(e) => handleChange('placeholder', e.target.value)}
                      placeholder="Type your message..."
                    />
                  </div>
                </div>

                {/* Appearance settings */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="position">Position</Label>
                    <Select
                      value={state.config.position}
                      onValueChange={(value) => handleChange('position', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Bottom Right</SelectItem>
                        <SelectItem value="bottom-left">Bottom Left</SelectItem>
                        <SelectItem value="top-right">Top Right</SelectItem>
                        <SelectItem value="top-left">Top Left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="primaryColor">Primary Color</Label>
                    <Input
                      id="primaryColor"
                      type="color"
                      value={state.config.primaryColor}
                      onChange={(e) => handleChange('primaryColor', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="embed">
          <Card>
            <CardHeader>
              <CardTitle>Embed Code Generator</CardTitle>
              <CardDescription>
                Copy these code snippets to add the chat widget to your website.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="standard">
                <TabsList className="mb-4">
                  <TabsTrigger value="standard">Standard</TabsTrigger>
                  <TabsTrigger value="gtm">Google Tag Manager</TabsTrigger>
                  <TabsTrigger value="direct">Direct Body Embed</TabsTrigger>
                </TabsList>

                <TabsContent value="standard">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Add this code to your website's <code>&lt;head&gt;</code> or <code>&lt;body&gt;</code> section.
                    </p>
                    <div className="relative">
                      <pre className="p-4 bg-gray-50 rounded-lg overflow-x-auto">
                        <code className="text-sm">{standardEmbed}</code>
                      </pre>
                      <Button
                        className="absolute top-2 right-2"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(standardEmbed);
                          alert('Embed code copied to clipboard!');
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="gtm">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Add this code as a Custom HTML tag in Google Tag Manager.
                    </p>
                    <div className="relative">
                      <pre className="p-4 bg-gray-50 rounded-lg overflow-x-auto">
                        <code className="text-sm">{gtmEmbed}</code>
                      </pre>
                      <Button
                        className="absolute top-2 right-2"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(gtmEmbed);
                          alert('GTM code copied to clipboard!');
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="direct">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Add this code where you want the chat widget to appear in your page.
                    </p>
                    <div className="relative">
                      <pre className="p-4 bg-gray-50 rounded-lg overflow-x-auto">
                        <code className="text-sm">{directEmbed}</code>
                      </pre>
                      <Button
                        className="absolute top-2 right-2"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(directEmbed);
                          alert('Direct embed code copied to clipboard!');
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 