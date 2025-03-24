import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { redisCache } from '@/lib/vector/rag-cache';

// Initialize Redis client directly using environment variables
const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key') || 'global:rag:4525a018453d5765';
  
  try {
    // Get raw value directly from Redis without any processing
    const rawValue = await redis.get(key);
    
    // Attempt to parse it with our client code
    let parsedValue = null;
    let parseError = null;
    
    try {
      if (typeof rawValue === 'string') {
        parsedValue = JSON.parse(rawValue);
      }
    } catch (error) {
      parseError = {
        message: error instanceof Error ? error.message : String(error),
        type: typeof rawValue
      };
    }
    
    // Get value using our cache wrapper for comparison
    const cacheResult = await redisCache.get(key);
    
    return NextResponse.json({
      key,
      exists: rawValue !== null,
      rawValue,
      rawValueType: typeof rawValue,
      rawValueLength: typeof rawValue === 'string' ? rawValue.length : null,
      // If rawValue starts with a quote and ends with a quote, it might be double-stringified
      possiblyDoubleStringified: typeof rawValue === 'string' && 
        rawValue.startsWith('"') && 
        rawValue.endsWith('"') && 
        rawValue.includes('\\'),
      parseError,
      parsedValue,
      cacheResult,
      cacheResultType: typeof cacheResult
    }, {
      status: 200
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 500
    });
  }
} 