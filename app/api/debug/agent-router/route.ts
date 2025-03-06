import { NextResponse } from 'next/server';
import { AgentRouter } from '@/lib/agents/agent-router';
import { edgeLogger } from '@/lib/logger/edge-logger';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = body;
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }
    
    edgeLogger.info('Debug agent router request', { messageLength: message.length });
    
    const agentRouter = new AgentRouter();
    const analysis = agentRouter.analyzeMessage(message);
    
    edgeLogger.info('Agent router analysis complete', { 
      recommended: analysis.recommended,
      scores: analysis.scores
    });
    
    return NextResponse.json({
      message,
      analysis
    });
  } catch (error) {
    edgeLogger.error('Error in debug agent router', { error });
    return NextResponse.json(
      { error: 'An error occurred processing your request' },
      { status: 500 }
    );
  }
} 