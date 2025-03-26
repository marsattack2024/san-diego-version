import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public/widget-test.html');
    const htmlContent = readFileSync(filePath, 'utf8');
    
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      }
    });
  } catch (error) {
    console.error('Error serving widget-test.html:', error);
    return new NextResponse('Error loading widget test page', { 
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
} 