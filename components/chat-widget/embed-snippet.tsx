'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatWidgetConfig, DEFAULT_CONFIG } from './types'

interface EmbedSnippetProps {
  config?: Partial<ChatWidgetConfig>
  apiUrl?: string
}

export function EmbedSnippet({
  config = {},
  apiUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://marlan.photographytoprofits.com'
}: EmbedSnippetProps) {
  const [copied, setCopied] = useState(false)
  const [baseUrl, setBaseUrl] = useState(apiUrl)

  // Set base URL with fallback to window.location.origin if running in browser
  useEffect(() => {
    if (typeof window !== 'undefined' && !baseUrl) {
      setBaseUrl(window.location.origin);
    }
  }, [baseUrl]);

  // Use the determined URL or fallback
  const finalUrl = baseUrl || 'https://marlan.photographytoprofits.com';

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
}(window, document, 'script', 'chatWidget', '${finalUrl}/widget.js'));

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
      <p className="text-sm text-gray-500">
        Copy and paste this code snippet before the /body tag to embed the chat widget on the bottom left of your page.
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