/**
 * Test Route: Mock Users API
 * 
 * This route demonstrates the usage of the test-route-handler utility
 * to create protected development/test-only endpoints.
 */

import { createMockHandler } from '@/lib/utils/test-route-handler';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';

// Sample mock data for testing
const mockUsers = [
    {
        id: '1',
        name: 'Test User 1',
        email: 'user1@example.com',
        role: 'admin',
        created_at: '2023-01-01T00:00:00Z'
    },
    {
        id: '2',
        name: 'Test User 2',
        email: 'user2@example.com',
        role: 'user',
        created_at: '2023-01-02T00:00:00Z'
    },
    {
        id: '3',
        name: 'Test User 3',
        email: 'user3@example.com',
        role: 'user',
        created_at: '2023-01-03T00:00:00Z'
    }
];

/**
 * GET handler to retrieve mock user data
 * This endpoint is only available in development and test environments
 */
export const GET = createMockHandler(
    {
        users: mockUsers,
        count: mockUsers.length,
        page: 1,
        limit: 10
    },
    {
        // Simulate network latency
        delay: 300,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Type': 'application/json'
        }
    }
);

/**
 * POST handler to simulate user creation
 * This endpoint is only available in development and test environments
 */
export const POST = createMockHandler(
    async (request: Request) => {
        try {
            // Parse the request body
            const body = await request.json();

            // Log the request for debugging
            edgeLogger.info('Test user creation request', {
                category: LOG_CATEGORIES.SYSTEM,
                body
            });

            // Validate required fields
            if (!body.name || !body.email) {
                return {
                    error: 'Missing required fields',
                    status: 400
                };
            }

            // Create a new mock user
            const newUser = {
                id: `${mockUsers.length + 1}`,
                name: body.name,
                email: body.email,
                role: body.role || 'user',
                created_at: new Date().toISOString()
            };

            // Return success response
            return {
                user: newUser,
                message: 'User created successfully'
            };
        } catch (error) {
            // Return error response
            return {
                error: 'Failed to process request',
                message: error instanceof Error ? error.message : String(error),
                status: 500
            };
        }
    },
    {
        // Simulate network latency
        delay: 500
    }
);

/**
 * DELETE handler to simulate user deletion
 * This endpoint is only available in development and test environments
 */
export const DELETE = createMockHandler(
    async (request: Request) => {
        try {
            // Get user ID from URL
            const url = new URL(request.url);
            const userId = url.searchParams.get('id');

            if (!userId) {
                return {
                    error: 'Missing user ID',
                    status: 400
                };
            }

            // Check if user exists
            const userExists = mockUsers.some(user => user.id === userId);

            if (!userExists) {
                return {
                    error: 'User not found',
                    status: 404
                };
            }

            // Return success response
            return {
                message: `User ${userId} deleted successfully`
            };
        } catch (error) {
            return {
                error: 'Failed to process request',
                message: error instanceof Error ? error.message : String(error),
                status: 500
            };
        }
    },
    {
        delay: 300
    }
); 