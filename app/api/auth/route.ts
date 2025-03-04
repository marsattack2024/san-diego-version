import { NextResponse } from 'next/server';
import { z } from 'zod';

// Define validation schema for login
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    // Parse the request body
    const body = await req.json();
    
    // Validate login credentials
    const parseResult = LoginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid credentials format' },
        { status: 400 }
      );
    }
    
    // Mock authentication - would connect to a real auth service in production
    const { email, password } = parseResult.data;
    
    // Simple mock validation
    if (email === 'user@example.com' && password === 'password') {
      return NextResponse.json({
        user: {
          id: '1',
          email,
          name: 'Demo User',
        },
        token: 'mock-jwt-token',
      });
    }
    
    // Authentication failed
    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

