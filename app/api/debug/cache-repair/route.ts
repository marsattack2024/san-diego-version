import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { redisCache } from '@/lib/vector/rag-cache';

// Initialize Redis client directly using environment variables
const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key') || 'global:rag:4525a018453d5765';
  
  try {
    // Step 1: Get the raw value directly from Redis
    const rawValue = await redis.get(key);
    
    if (!rawValue) {
      return NextResponse.json({
        error: 'Cache key not found',
        key
      }, { status: 404 });
    }
    
    // Step 2: Attempt to fix double-stringified values
    let fixedValue;
    const isDoubleStringified = 
      typeof rawValue === 'string' && 
      rawValue.startsWith('"') && 
      rawValue.endsWith('"') && 
      rawValue.includes('\\');
    
    if (isDoubleStringified) {
      try {
        // Parse the outer JSON string
        const innerJson = JSON.parse(rawValue);
        
        // The inner value should now be a string, so we use it directly
        fixedValue = innerJson;
      } catch (e) {
        return NextResponse.json({
          error: 'Failed to fix double-stringified JSON',
          rawValue,
          parseError: e instanceof Error ? e.message : String(e)
        }, { status: 400 });
      }
    } else {
      // Not double-stringified, so we use it as is
      fixedValue = rawValue;
    }
    
    // Step 3: Store the fixed value back in Redis
    // We use the direct Redis client to avoid any additional processing
    await redis.set(key, fixedValue);
    
    // Step 4: Verify the fix
    const newValue = await redis.get(key);
    
    return NextResponse.json({
      key,
      fixed: isDoubleStringified,
      originalValue: rawValue,
      fixedValue,
      newValue,
      success: newValue === fixedValue
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 