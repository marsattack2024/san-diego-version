/**
 * Title Generation Authentication Unit Test
 * 
 * This test verifies that the title generation API properly handles authentication
 * by using Supabase auth.getUser() as the primary authentication method with cookies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '../../helpers/mock-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Set up mocks before importing the code under test
setupLoggerMock();

// Mock Supabase client
vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn().mockImplementation(() => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: { id: 'test-user-id' } },
                error: null
            })
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
            data: { title: 'Generated Test Title' },
            error: null
        })
    }))
}));

// Mock the title-service
vi.mock('@/lib/chat/title-service', () => ({
    generateAndSaveChatTitle: vi.fn().mockResolvedValue(undefined)
}));

// Mock uuid generator
vi.mock('@/lib/utils/uuid', () => ({
    generateShortId: vi.fn().mockReturnValue('mock-operation-id')
}));

// Import the code under test (after setting up mocks)
import { POST } from '@/app/api/chat/update-title/route';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateAndSaveChatTitle } from '@/lib/chat/title-service';

describe('Title Generation Authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLogger.reset();
    });

    it('should use Supabase auth.getUser() for standard authentication', async () => {
        // Arrange: Create a test request with cookies for authentication
        const mockRequest = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'sb-test-auth-token=test-token'
            },
            body: JSON.stringify({
                sessionId: 'test-session-id',
                content: 'Test message for title generation'
            })
        }) as unknown as NextRequest;

        // Act: Call the API endpoint
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert: Verify the response and authentication flow
        expect(response.status).toBe(200);
        expect(data).toEqual({
            success: true,
            chatId: 'test-session-id',
            title: 'Generated Test Title'
        });

        // Verify Supabase auth was used for authentication
        expect(createClient).toHaveBeenCalled();
        const mockSupabase = await (createClient as any).mock.results[0].value;
        expect(mockSupabase.auth.getUser).toHaveBeenCalled();

        // Verify the title was generated with the authenticated user ID
        expect(generateAndSaveChatTitle).toHaveBeenCalledWith(
            'test-session-id',
            'Test message for title generation',
            'test-user-id'
        );
    });

    it('should fall back to session lookup if authentication fails', async () => {
        // Arrange: Set up auth to fail but session lookup to succeed
        const mockSupabase = {
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: null },
                    error: new Error('Auth failed')
                })
            },
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(input => {
                // Return session data for session lookup
                if (input === 'user_id') {
                    return Promise.resolve({
                        data: { user_id: 'fallback-user-id' },
                        error: null
                    });
                }
                // Return title after generation
                return Promise.resolve({
                    data: { title: 'Fallback Generated Title' },
                    error: null
                });
            })
        };
        (createClient as any).mockResolvedValue(mockSupabase);

        // Create test request
        const mockRequest = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: 'test-session-id',
                content: 'Test message for title generation'
            })
        }) as unknown as NextRequest;

        // Act: Call the API endpoint
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert: Verify the response and fallback authentication
        expect(response.status).toBe(200);
        expect(data).toEqual({
            success: true,
            chatId: 'test-session-id',
            title: 'Fallback Generated Title'
        });

        // Verify fallback was logged
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Generating title using session user_id',
            expect.objectContaining({
                category: 'chat',
                sessionId: 'test-session-id',
                userId: 'fallback-user-id'
            })
        );
    });

    it('should return 401 when authentication fails and session lookup fails', async () => {
        // Arrange: Set up auth to fail and session lookup to fail
        const mockSupabase = {
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: null },
                    error: new Error('Auth failed')
                })
            },
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('Session not found')
            })
        };
        (createClient as any).mockResolvedValue(mockSupabase);

        // Create test request
        const mockRequest = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: 'invalid-session-id',
                content: 'Test message for title generation'
            })
        }) as unknown as NextRequest;

        // Act: Call the API endpoint
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert: Verify the response is 401 Unauthorized
        expect(response.status).toBe(401);
        expect(data).toEqual({
            success: false,
            error: 'Unauthorized and could not find session'
        });

        // Verify auth failure was logged
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'Auth error for title generation',
            expect.objectContaining({
                category: 'system',
                sessionId: 'invalid-session-id'
            })
        );
    });
}); 