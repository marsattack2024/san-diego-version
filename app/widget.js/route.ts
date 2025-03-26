import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Serve the widget script file
export async function GET(req: NextRequest) {
  try {
    // In production, serve the pre-built widget-script.js
    // In development, we could dynamically generate it
    const filePath = join(process.cwd(), 'lib/widget/widget-script.js')
    const scriptContent = readFileSync(filePath, 'utf-8')
    
    // Add cache control headers for efficient delivery
    return new Response(scriptContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  } catch (error) {
    console.error('Error serving widget script:', error)
    return new Response('console.error("Failed to load chat widget script");', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript',
      },
    })
  }
} 