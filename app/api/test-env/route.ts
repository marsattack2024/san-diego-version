import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  // Get all environment variables
  const envVars = {
    hasPerplexityKey: !!process.env.PERPLEXITY_API_KEY,
    keyLength: process.env.PERPLEXITY_API_KEY?.length,
    keyPrefix: process.env.PERPLEXITY_API_KEY?.substring(0, 5),
    keySuffix: process.env.PERPLEXITY_API_KEY?.substring((process.env.PERPLEXITY_API_KEY?.length || 0) - 5),
    runtime: typeof (globalThis as any).EdgeRuntime === 'string' ? 'edge' : 'node',
    allEnvKeys: Object.keys(process.env).filter(key => 
      !key.includes('SECRET') && 
      !key.includes('TOKEN') && 
      !key.includes('PASSWORD') &&
      !key.includes('KEY')
    ),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  };

  return NextResponse.json({ 
    success: true, 
    message: 'Environment test',
    envVars
  });
} 