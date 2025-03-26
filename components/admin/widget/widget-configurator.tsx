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
import { getSiteUrl, validateCriticalEnv } from '@/lib/widget/env-validator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

export function AdminWidgetConfigurator() {
  const { state, setConfig, toggleWidget } = useChatWidget()
  const [activeTab, setActiveTab] = useState('config')
  const [showEmbed, setShowEmbed] = useState(false)
  const [envWarning, setEnvWarning] = useState<string | null>(null)
  
  // More robust URL resolution with immediate client-side fallback
  const [baseUrl, setBaseUrl] = useState(() => {
    // Client-side rendering - use window.location.origin directly if available
    if (typeof window !== 'undefined') {
      // Browser available - use origin directly
      return window.location.origin;
    }
    
    // Server-side rendering - fall back to getSiteUrl()
    try {
      return getSiteUrl();
    } catch (e) {
      console.error('Error getting site URL:', e);
      // This fallback will be replaced with actual URL after client-side hydration
      return 'https://marlan.photographytoprofits.com';
    }
  })
  
  // Additional verification and logging after component mounts
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
      // Always ensure baseUrl is set to at least window.location.origin
      if (!baseUrl || baseUrl === 'https://marlan.photographytoprofits.com') {
        const browserUrl = window.location.origin;
        console.log('Updating baseUrl from browser:', browserUrl);
        setBaseUrl(browserUrl);
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
      
      // Validate environment variables and update warnings
      const envValidation = validateCriticalEnv();
      if (!envValidation.isValid) {
        // Only show warnings if we have actual missing variables
        // (excluding NEXT_PUBLIC_SITE_URL when we have a valid browser URL)
        if (envValidation.missing.some(v => v !== 'NEXT_PUBLIC_SITE_URL')) {
          setEnvWarning(envValidation.message);
        }
      }
    }
  }, [baseUrl]);
  
  // Handle input changes
  const handleChange = (key: keyof ChatWidgetConfig, value: any) => {
    setConfig({ [key]: value })
  }
  
  return (
    <div className="space-y-6">
      {envWarning && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Environment Warning</AlertTitle>
          <AlertDescription>
            {envWarning}
            <p className="text-xs mt-1">
              The widget may not function correctly on production without these variables.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="config" onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="embed">Embed Codes</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config">
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
                      placeholder="Hello! How can I help you today?"
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
                    <Label htmlFor="position">Widget Position</Label>
                    <Select 
                      value={state.config.position} 
                      onValueChange={(value: any) => handleChange('position', value)}
                    >
                      <SelectTrigger id="position">
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
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={state.config.primaryColor}
                        onChange={(e) => handleChange('primaryColor', e.target.value)}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={state.config.primaryColor}
                        onChange={(e) => handleChange('primaryColor', e.target.value)}
                        placeholder="#0070f3"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="width">Width (px)</Label>
                      <Input
                        id="width"
                        type="number"
                        value={state.config.width}
                        onChange={(e) => handleChange('width', parseInt(e.target.value))}
                        min={250}
                        max={500}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="height">Height (px)</Label>
                      <Input
                        id="height"
                        type="number"
                        value={state.config.height}
                        onChange={(e) => handleChange('height', parseInt(e.target.value))}
                        min={300}
                        max={700}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-4 mt-4 border-t">
                <Button onClick={toggleWidget}>
                  {state.isOpen ? 'Close Widget' : 'Open Widget'}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => setConfig(DEFAULT_CONFIG)}
                >
                  Reset to Defaults
                </Button>
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
                  <EmbedSnippet 
                    config={state.config} 
                    apiUrl={baseUrl}
                  />
                </TabsContent>
                
                <TabsContent value="gtm">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      This code is optimized for Google Tag Manager. Add it as a Custom HTML tag.
                    </p>
                    <div className="relative">
                      <textarea 
                        className="w-full h-[200px] p-4 font-mono text-sm border rounded-md" 
                        readOnly
                        value={`<!-- Marlin Chat Widget - GTM Version -->
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
    console.error("Failed to load Marlin Chat Widget");
    
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
</script>`}
                      />
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(document.querySelector('textarea')?.value || '')
                        }}
                        className="absolute top-2 right-2"
                        variant="secondary"
                        size="sm"
                      >
                        Copy Code
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="direct">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Simple version for direct embedding before the closing body tag.
                    </p>
                    <div className="relative">
                      <textarea 
                        className="w-full h-[200px] p-4 font-mono text-sm border rounded-md" 
                        readOnly
                        value={`<!-- Marlin Chat Widget - Simple Version -->
<script>
  window.marlinChatConfig = {
    position: '${state.config.position}',
    title: '${state.config.title}',
    primaryColor: '${state.config.primaryColor}',
    apiEndpoint: '${baseUrl}/api/widget-chat'
  };
  
  (function() {
    var script = document.createElement('script');
    script.src = "${baseUrl}/widget.js";
    script.async = true;
    script.defer = true;
    script.onerror = function() {
      console.error('Failed to load Marlin chat widget');
    };
    document.body.appendChild(script);
  })();
</script>`}
                      />
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(document.querySelector('textarea')?.value || '')
                        }}
                        className="absolute top-2 right-2"
                        variant="secondary"
                        size="sm"
                      >
                        Copy Code
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="docs">
          <Card>
            <CardHeader>
              <CardTitle>Widget Documentation</CardTitle>
              <CardDescription>
                Implementation guide and troubleshooting information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <h3>Implementation Guide</h3>
                <p>The Marlin Chat Widget can be embedded on any website to provide AI chat functionality. It leverages the knowledge base system to provide relevant information to users.</p>
                
                <h4>Key Features</h4>
                <ul>
                  <li>RAG (Retrieval Augmented Generation) implementation</li>
                  <li>Session-based conversation persistence (24 hours)</li>
                  <li>Customizable appearance and behavior</li>
                  <li>Rate limiting to prevent abuse</li>
                </ul>
                
                <h4>Implementation Options</h4>
                <p>Choose the implementation method that works best for your website:</p>
                <ol>
                  <li><strong>Standard Script Tag:</strong> Simple JavaScript implementation</li>
                  <li><strong>Google Tag Manager:</strong> For websites using GTM</li>
                  <li><strong>Direct Body Embed:</strong> Simplified version for direct embedding</li>
                </ol>
                
                <h4>Configuration Options</h4>
                <p>The widget can be customized using the <code>window.marlinChatConfig</code> object with the following properties:</p>
                <ul>
                  <li><code>position</code>: Widget position (bottom-right, bottom-left, top-right, top-left)</li>
                  <li><code>title</code>: Text displayed in the widget header</li>
                  <li><code>primaryColor</code>: Main accent color in hex format</li>
                  <li><code>greeting</code>: Initial message shown when the widget opens</li>
                  <li><code>placeholder</code>: Text shown in the input field</li>
                </ul>
                
                <h3>Troubleshooting</h3>
                <p>If you encounter issues with the widget, check the following:</p>
                <ul>
                  <li>Verify that the script URL is correct and accessible</li>
                  <li>Check browser console for any errors</li>
                  <li>Ensure the API endpoint is correctly configured</li>
                  <li>Confirm that CORS headers are properly set on your server</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Live Preview</h3>
        <div className="flex items-center justify-center p-4 border rounded-lg bg-gray-50 h-[400px]">
          <p className="text-center text-gray-500">
            The chat widget should appear in the corner of this page based on your configuration.
            <br />
            {!state.isOpen && (
              <Button 
                variant="default" 
                className="mt-4" 
                onClick={toggleWidget}
              >
                Open Widget
              </Button>
            )}
          </p>
        </div>
      </div>
    </div>
  )
} 