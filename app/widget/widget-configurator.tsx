'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChatWidgetConfig, DEFAULT_CONFIG } from '@/components/chat-widget/types'
import { EmbedSnippet } from '@/components/chat-widget/embed-snippet'
import { useChatWidget } from '@/components/chat-widget'

export default function WidgetConfigurator() {
  const { state, setConfig, toggleWidget } = useChatWidget()
  const [showEmbed, setShowEmbed] = useState(false)
  
  // Handle input changes
  const handleChange = (key: keyof ChatWidgetConfig, value: any) => {
    setConfig({ [key]: value })
  }
  
  return (
    <div className="space-y-6">
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
              onValueChange={(value) => handleChange('position', value)}
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
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button onClick={toggleWidget}>
          {state.isOpen ? 'Close Widget' : 'Open Widget'}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={() => setConfig(DEFAULT_CONFIG)}
        >
          Reset to Defaults
        </Button>
        
        <Button 
          variant="secondary"
          onClick={() => setShowEmbed(!showEmbed)}
        >
          {showEmbed ? 'Hide Embed Code' : 'Get Embed Code'}
        </Button>
      </div>
      
      {/* Embed code snippet */}
      {showEmbed && (
        <div className="mt-6 p-4 border rounded-lg bg-gray-50">
          <EmbedSnippet config={state.config} />
        </div>
      )}
    </div>
  )
} 