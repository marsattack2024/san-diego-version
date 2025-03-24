import { NextRequest, NextResponse } from 'next/server';
import { redisClientPromise } from '../../../../lib/vector/rag-cache';
import { edgeLogger } from '../../../../lib/logger/edge-logger';
import { LOG_CATEGORIES } from '../../../../lib/logger/constants';

/**
 * A comprehensive cache debugging endpoint that shows the raw cached value,
 * attempts to parse it in different ways, and provides diagnostic information.
 * 
 * Query parameters:
 * - key: The Redis cache key to inspect
 * 
 * Example: /api/debug/cache-inspector?key=vector:query:12345
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ 
        error: 'Missing required parameter: key', 
        usage: '/api/debug/cache-inspector?key=your-cache-key' 
      }, { status: 400 });
    }

    const redis = await redisClientPromise;
    const rawValue = await redis.get<string>(key);

    if (!rawValue) {
      return NextResponse.json({ 
        error: 'Cache key not found', 
        key 
      }, { status: 404 });
    }

    // Prepare diagnostic information
    const diagnostics = {
      key,
      rawValue: {
        type: typeof rawValue,
        length: rawValue.length,
        preview: rawValue.substring(0, 100) + (rawValue.length > 100 ? '...' : ''),
        startsWithQuote: rawValue.startsWith('"'),
        endsWithQuote: rawValue.endsWith('"'),
        containsEscapedQuotes: rawValue.includes('\\"'),
        containsEscapeChars: rawValue.includes('\\'),
        containsObjectNotation: rawValue.includes('[object Object]'),
      },
      parsedValue: {
        directParse: null as any,
        directParseError: null as string | null,
        innerStringParse: null as any,
        innerStringParseError: null as string | null,
        innerStringAttempt: null as any,
        innerStringAttemptError: null as string | null
      }
    };

    // Attempt direct parsing
    try {
      const parsed = JSON.parse(rawValue);
      diagnostics.parsedValue.directParse = {
        type: typeof parsed,
        isArray: Array.isArray(parsed),
        preview: typeof parsed === 'object' 
          ? JSON.stringify(parsed).substring(0, 100) + (JSON.stringify(parsed).length > 100 ? '...' : '')
          : String(parsed).substring(0, 100) + (String(parsed).length > 100 ? '...' : '')
      };
    } catch (error) {
      diagnostics.parsedValue.directParseError = error instanceof Error 
        ? error.message 
        : String(error);
    }

    // Check if this might be a doubly-stringified value
    if (typeof rawValue === 'string' && rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.includes('\\')) {
      try {
        // Extract the inner string by removing the outer quotes and unescaping
        const innerString = rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        
        diagnostics.parsedValue.innerStringAttempt = {
          innerStringPreview: innerString.substring(0, 100) + (innerString.length > 100 ? '...' : ''),
          innerStringLength: innerString.length
        };
        
        try {
          const parsedInner = JSON.parse(innerString);
          diagnostics.parsedValue.innerStringParse = {
            type: typeof parsedInner,
            isArray: Array.isArray(parsedInner),
            preview: typeof parsedInner === 'object' 
              ? JSON.stringify(parsedInner).substring(0, 100) + (JSON.stringify(parsedInner).length > 100 ? '...' : '')
              : String(parsedInner).substring(0, 100) + (String(parsedInner).length > 100 ? '...' : '')
          };
        } catch (innerError) {
          diagnostics.parsedValue.innerStringParseError = innerError instanceof Error 
            ? innerError.message 
            : String(innerError);
        }
      } catch (error) {
        diagnostics.parsedValue.innerStringAttemptError = error instanceof Error 
          ? error.message 
          : String(error);
      }
    }

    // Log diagnostic activity
    edgeLogger.info('Cache inspection', {
      category: LOG_CATEGORIES.SYSTEM,
      key,
      valueType: typeof rawValue,
      valueLength: rawValue.length,
      directParseSuccess: diagnostics.parsedValue.directParse !== null,
      innerParseSuccess: diagnostics.parsedValue.innerStringParse !== null
    });

    return NextResponse.json({
      success: true,
      diagnostics
    });
  } catch (error) {
    console.error('Cache inspector error:', error);
    edgeLogger.error('Cache inspector error', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json({
      error: 'Error inspecting cache',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 