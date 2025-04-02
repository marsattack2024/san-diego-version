import { describe, expect, it, vi, beforeEach, Mock } from 'vitest';
import { POST } from '@/app/api/chat/update-title/route';
import { NextRequest, NextResponse } from 'next/server';

// Mock next/headers cookies function
vi.mock('next/headers', () => ({
    cookies: vi.fn().mockReturnValue({
        getAll: vi.fn().mockReturnValue([{ name: 'test-cookie', value: 'test-value' }]),
        get: vi.fn().mockReturnValue({ name: 'test-cookie', value: 'test-value' }),
        set: vi.fn()
    })
}));

// Mock the dependencies
vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn()
}));

vi.mock('@/lib/chat/title-service', () => ({
    generateAndSaveChatTitle: vi.fn()
}));

vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock crypto.randomUUID properly
vi.mock('crypto', () => ({
    randomUUID: () => 'test-uuid-12345'
}));

// Import the mocked dependencies
import { createClient } from '@/utils/supabase/server';
import { generateAndSaveChatTitle } from '@/lib/chat/title-service';
import { edgeLogger } from '@/lib/logger/edge-logger';

describe('Title Update API', () => {
    let mockSupabase: any;
    let mockRequest: any;
    let mockJson: Mock;

    beforeEach(() => {
        vi.resetAllMocks();

        // Setup Supabase mock
        mockSupabase = {
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: {
                        user: { id: 'test-user-id' }
                    }
                })
            },
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: { title: 'Generated Title' },
                error: null
            })
        };

        (createClient as Mock).mockResolvedValue(mockSupabase);

        // Setup request mock
        mockJson = vi.fn().mockResolvedValue({
            sessionId: 'test-session-id',
            content: 'Test message content'
        });

        mockRequest = {
            json: mockJson
        } as unknown as NextRequest;

        // Setup title service mock
        (generateAndSaveChatTitle as Mock).mockResolvedValue(undefined);
    });

    it('should return 400 if sessionId is missing', async () => {
        // Arrange
        mockJson.mockResolvedValueOnce({ content: 'Test message without sessionId' });

        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(400);
        expect(data).toEqual({
            success: false,
            error: 'Session ID is required'
        });
        // No logging happens for this case in the implementation
    });

    it('should return 401 if user is not authenticated', async () => {
        // Arrange
        mockSupabase.auth.getUser.mockResolvedValueOnce({
            data: { user: null }
        });

        // Mock the session lookup to fail as well
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
            data: null,
            error: { message: 'Session not found' }
        });

        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(401);
        expect(data).toEqual({
            success: false,
            error: 'Unauthorized and could not find session'
        });
        expect(edgeLogger.warn).toHaveBeenCalled();
    });

    it('should return 500 if title generation fails', async () => {
        // Arrange
        mockSupabase.single.mockResolvedValueOnce({
            data: null,
            error: null
        });

        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(500);
        expect(data).toEqual({
            success: false,
            error: 'Failed to generate title'
        });
        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Failed to fetch generated title',
            expect.objectContaining({
                sessionId: 'test-session-id'
            })
        );
    });

    it('should return success with title on successful generation', async () => {
        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(200);
        expect(data).toEqual({
            success: true,
            chatId: 'test-session-id',
            title: 'Generated Title'
        });
        expect(generateAndSaveChatTitle).toHaveBeenCalledWith(
            'test-session-id',
            'Test message content',
            'test-user-id'
        );
        expect(edgeLogger.info).toHaveBeenCalledWith(
            'Generating title for chat',
            expect.objectContaining({
                sessionId: 'test-session-id',
                userId: 'test-user-id'
            })
        );
    });

    it('should handle errors during title generation', async () => {
        // Arrange
        (generateAndSaveChatTitle as Mock).mockRejectedValueOnce(new Error('Title generation failed'));

        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(500);
        expect(data).toEqual({
            success: false,
            error: 'Failed to generate title'
        });
        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Error generating title',
            expect.objectContaining({
                error: 'Title generation failed',
                sessionId: 'test-session-id'
            })
        );
    });

    it('should handle JSON parsing errors', async () => {
        // Arrange
        mockJson.mockRejectedValueOnce(new Error('Invalid JSON'));

        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(400);
        expect(data).toEqual({
            success: false,
            error: 'Invalid request body'
        });
        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Failed to parse request body',
            expect.objectContaining({
                error: 'Invalid JSON'
            })
        );
    });

    it('should use standard authentication pattern with cookies', async () => {
        // Arrange - Set up a request with cookies
        const cookies = [
            { name: 'sb-abc123-auth-token', value: 'test-token' }
        ];

        // Create a mock request with cookies and standard authentication headers
        const requestWithCookies = {
            ...mockRequest,
            cookies: {
                getAll: vi.fn().mockReturnValue(cookies),
                get: vi.fn().mockImplementation(name => cookies.find(c => c.name === name))
            },
            headers: new Headers({
                'cookie': 'sb-abc123-auth-token=test-token',
                'x-auth-ready': 'true',
                'x-auth-state': 'authenticated',
                'x-supabase-auth': 'test-user-id'
            })
        } as unknown as NextRequest;

        // Mock the createClient to return the user properly
        (createClient as Mock).mockImplementationOnce(() => mockSupabase);

        // Act
        const response = await POST(requestWithCookies);

        // Assert
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            chatId: 'test-session-id',
            title: 'Generated Title'
        });

        // Verify we used standard Supabase authentication
        expect(mockSupabase.auth.getUser).toHaveBeenCalled();
    });

    it('should accept service-to-service authentication via headers', async () => {
        // Arrange - Set up a request with service auth headers
        const requestWithServiceAuth = {
            ...mockRequest,
            headers: new Headers({
                'Content-Type': 'application/json',
                'x-user-id': 'service-user-id',
                'x-session-context': 'chat-engine-title-generation',
                'x-auth-state': 'authenticated'
            })
        } as unknown as NextRequest;

        // Mock json response to include userId in body as well
        mockJson.mockResolvedValueOnce({
            sessionId: 'test-session-id',
            content: 'Test message content',
            userId: 'body-user-id' // This shouldn't be used since header takes precedence
        });

        // Act
        const response = await POST(requestWithServiceAuth);

        // Assert
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            chatId: 'test-session-id',
            title: 'Generated Title'
        });

        // Verify title was generated with the user ID from service auth headers
        expect(generateAndSaveChatTitle).toHaveBeenCalledWith(
            'test-session-id',
            'Test message content',
            'service-user-id'
        );
    });
}); 