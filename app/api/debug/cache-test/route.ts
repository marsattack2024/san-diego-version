import { NextRequest, NextResponse } from 'next/server';
import { redisCache } from '../../../../lib/cache/redis-client';
import { edgeLogger } from '../../../../lib/logger/edge-logger';
import { LOG_CATEGORIES } from '../../../../lib/logger/constants';
import { Redis } from '@upstash/redis';

/**
 * API endpoint to test the Redis caching system.
 * Tests setting and getting different data types and checks for serialization issues.
 */
export async function GET(request: NextRequest) {
  try {
    // Use Redis.fromEnv() for consistent initialization across the codebase
    const redis = Redis.fromEnv();
    
    // Perform a connection test first
    try {
      await redis.set('connection-test', 'ok', { ex: 60 });
      const testResult = await redis.get('connection-test');
      
      if (testResult !== 'ok') {
        throw new Error('Connection test failed');
      }
      
      // Log successful connection
      edgeLogger.info('Redis connection test successful for cache test endpoint', {
        category: LOG_CATEGORIES.SYSTEM
      });
    } catch (connError) {
      edgeLogger.error('Redis connection test failed for cache test endpoint', {
        category: LOG_CATEGORIES.SYSTEM,
        error: connError instanceof Error ? connError.message : String(connError)
      });
      
      // Return error response if the Redis connection fails
      return NextResponse.json({
        success: false,
        error: 'Redis connection failed',
        details: connError instanceof Error ? connError.message : String(connError)
      }, { status: 500 });
    }
    
    // Generate a unique key for testing
    const testKey = `test:cache:${Date.now()}`;
    
    // Create a test object with various data types
    const testObject = {
      string: "Test string value",
      number: 12345,
      boolean: true,
      array: [1, 2, 3, "test", { nested: "object" }],
      object: {
        name: "Test object",
        properties: {
          deeply: {
            nested: "value"
          }
        }
      },
      date: new Date().toISOString(),
      nullValue: null
    };
    
    // Log test start
    edgeLogger.info('Starting cache test', {
      category: LOG_CATEGORIES.SYSTEM,
      testKey
    });
    
    // Set the test object in cache - direct Redis usage
    await redis.set(testKey, JSON.stringify(testObject), { ex: 60 });
    
    // Get the object back
    let retrievedObject = null;
    let retrievalError = null;
    
    try {
      const rawResult = await redis.get(testKey);
      if (rawResult && typeof rawResult === 'string') {
        retrievedObject = JSON.parse(rawResult);
      } else {
        retrievedObject = rawResult;
      }
    } catch (error) {
      retrievalError = error instanceof Error ? error.message : String(error);
    }
    
    // Clean up
    await redis.set(testKey, null, { ex: 1 }); // Short TTL for cleanup
    
    // JSON string to test serialization
    const jsonString = JSON.stringify({ data: "This is a JSON string" });
    const jsonStringKey = `${testKey}:json-string`;
    
    // Set and get a JSON string
    let retrievedJsonString = null;
    let jsonStringError = null;
    
    try {
      await redis.set(jsonStringKey, jsonString, { ex: 60 });
      const result = await redis.get(jsonStringKey);
      retrievedJsonString = result;
    } catch (error) {
      jsonStringError = error instanceof Error ? error.message : String(error);
    }
    
    await redis.set(jsonStringKey, null, { ex: 1 }); // Clean up
    
    // Test a regular string
    const regularString = "This is a regular string";
    const regularStringKey = `${testKey}:regular-string`;
    
    let retrievedRegularString = null;
    let regularStringError = null;
    
    try {
      await redis.set(regularStringKey, regularString, { ex: 60 });
      retrievedRegularString = await redis.get(regularStringKey);
    } catch (error) {
      regularStringError = error instanceof Error ? error.message : String(error);
    }
    
    await redis.set(regularStringKey, null, { ex: 1 }); // Clean up
    
    // Prepare response data
    const responseData = {
      success: true,
      testKey,
      originalObject: testObject,
      retrievedObject,
      objectEquality: JSON.stringify(testObject) === JSON.stringify(retrievedObject),
      objectRetrievalError: retrievalError,
      jsonStringTest: {
        original: jsonString,
        retrieved: retrievedJsonString,
        retrievedType: typeof retrievedJsonString,
        isEqual: jsonString === retrievedJsonString || 
                 (retrievedJsonString && typeof retrievedJsonString === 'object' && 
                  JSON.stringify(JSON.parse(jsonString)) === JSON.stringify(retrievedJsonString)),
        error: jsonStringError
      },
      regularStringTest: {
        original: regularString,
        retrieved: retrievedRegularString,
        retrievedType: typeof retrievedRegularString,
        isEqual: regularString === retrievedRegularString,
        error: regularStringError
      },
      cacheParseError: null,
      timeToLive: 60 // 60 second TTL for test keys
    };
    
    return NextResponse.json(responseData);
  } catch (error) {
    edgeLogger.error('Cache test error', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 