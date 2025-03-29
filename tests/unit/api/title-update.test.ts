import { describe, expect, it, vi, beforeEach, Mock } from 'vitest';
import { POST } from '@/app/api/chat/update-title/route';
import { NextRequest, NextResponse } from 'next/server';

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
            message: 'Missing sessionId'
        });
        expect(edgeLogger.warn).toHaveBeenCalledWith(
            'Missing sessionId in title update request',
            expect.objectContaining({ operationId: expect.any(String) })
        );
    });

    it('should return 401 if user is not authenticated', async () => {
        // Arrange
        mockSupabase.auth.getUser.mockResolvedValueOnce({
            data: { user: null }
        });

        // Act
        const response = await POST(mockRequest);
        const data = await response.json();

        // Assert
        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(401);
        expect(data).toEqual({
            success: false,
            message: 'Unauthorized'
        });
        expect(edgeLogger.warn).toHaveBeenCalledWith(
            'Unauthorized title update attempt',
            expect.objectContaining({
                operationId: expect.any(String),
                sessionId: 'test-session-id'
            })
        );
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
            message: 'Failed to generate title'
        });
        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Failed to generate title - no title returned',
            expect.objectContaining({
                operationId: expect.any(String),
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
            'Title generated successfully',
            expect.objectContaining({
                sessionId: 'test-session-id',
                title: 'Generated Title'
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
            message: 'Title generation failed'
        });
        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Error generating title:',
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
            message: 'Invalid request'
        });
        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Error in title update API:',
            expect.objectContaining({
                error: 'Invalid JSON'
            })
        );
    });
}); 