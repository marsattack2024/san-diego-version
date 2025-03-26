'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatWidgetConfig, DEFAULT_CONFIG } from './types'

interface EmbedSnippetProps {
  config?: Partial<ChatWidgetConfig>
  apiUrl?: string
}

export function EmbedSnippet({ 
  config = {}, 
  apiUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com'
}: EmbedSnippetProps) {
  const [copied, setCopied] = useState(false)
  
  // Merge with default config
  const widgetConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Create the embed code snippet
  const scriptCode = `
<!-- Chat Widget Embed Code -->
<script>
(function(w, d, s, o, f, js, fjs) {
  w['ChatWidgetObject'] = o;
  w[o] = w[o] || function() { (w[o].q = w[o].q || []).push(arguments) };
  js = d.createElement(s), fjs = d.getElementsByTagName(s)[0];
  js.id = o; js.src = f; js.async = 1; fjs.parentNode.insertBefore(js, fjs);
}(window, document, 'script', 'chatWidget', '${apiUrl}/widget.js'));

// Configure widget
chatWidget('config', ${JSON.stringify(widgetConfig, null, 2)});
</script>
<!-- End Chat Widget Embed Code -->
`.trim()
  
  // Copy code to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(scriptCode)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(err => console.error('Failed to copy code: ', err))
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Embed Chat Widget</h3>
      <p className="text-sm text-gray-500">
        Copy and paste this code snippet into your website to embed the chat widget.
      </p>
      
      <div className="relative">
        <Textarea 
          value={scriptCode}
          readOnly
          className="min-h-[200px] font-mono text-sm"
        />
        
        <Button
          onClick={copyToClipboard}
          className="absolute top-2 right-2"
          variant="secondary"
          size="sm"
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </Button>
      </div>
      
      <p className="text-xs text-gray-500">
        Note: The widget will be loaded asynchronously and won't block your website's performance.
      </p>
    </div>
  )
} 