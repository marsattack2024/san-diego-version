import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

export const runtime = 'edge';

// Define validation schema for login
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request): Promise<Response> {
  try {
    // Parse the request body
    const body = await req.json();

    // Validate login credentials
    const parseResult = LoginSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse('Invalid credentials format', parseResult.error.format(), 400);
    }

    // Mock authentication - would connect to a real auth service in production
    const { email, password } = parseResult.data;

    // Simple mock validation
    if (email === 'user@example.com' && password === 'password') {
      return successResponse({
        user: {
          id: '1',
          email,
          name: 'Demo User',
        },
        token: 'mock-jwt-token',
      });
    }

    // Authentication failed
    return unauthorizedError('Invalid credentials');
  } catch (error) {
    edgeLogger.error('Auth error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return errorResponse('An unexpected error occurred', error, 500);
  }
}

