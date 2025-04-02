import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock } from '../../helpers/mock-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Setup logger mock first
setupLoggerMock();

// Mock Supabase client
const mockSupabase = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
    auth: {
        getUser: vi.fn()
    }
};

vi.mock('@/lib/supabase/route-client', () => ({
    createRouteHandlerClient: vi.fn(() => mockSupabase)
}));

// Mock the AI SDK generateText function
vi.mock('ai', () => ({
    generateText: vi.fn()
}));

// Mock title-utils functions
vi.mock('@/lib/chat/title-utils', () => ({
    cleanTitle: vi.fn((title) => title ? title.trim() : 'Default Title'),
    updateTitleInDatabase: vi.fn()
}));

// Mock title-logger
vi.mock('@/lib/logger/title-logger', () => ({
    titleLogger: {
        titleGenerated: vi.fn(),
        titleGenerationFailed: vi.fn()
    }
}));

// Mock edge-logger
vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Import after mocks are set up
import { POST } from '@/app/api/chat/update-title/route';
import { generateText } from 'ai';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { titleLogger } from '@/lib/logger/title-logger';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';

// Mock route-handler utilities
vi.mock('@/lib/utils/route-handler', () => {
    const actual = vi.importActual('@/lib/utils/route-handler');
    return {
        ...actual,
        successResponse: vi.fn().mockImplementation((data) => ({ status: 200, body: data })),
        errorResponse: vi.fn().mockImplementation((message, error, status = 500) => ({ status, body: { message, error } })),
        unauthorizedError: vi.fn().mockImplementation(() => ({ status: 401, body: { message: 'Unauthorized' } })),
        validationError: vi.fn().mockImplementation((message) => ({ status: 400, body: { message } }))
    };
});

describe('Update Title API Route', () => {
    const TEST_SESSION_ID = 'test-session-id';
    const TEST_USER_ID = 'test-user-id';
    const TEST_CONTENT = 'This is test content for title generation';
    const TEST_GENERATED_TITLE = 'Generated Test Title';
    const MOCKED_SECRET = 'test-secret-for-route-test';

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Setup default Supabase auth mock
        mockSupabase.auth.getUser.mockResolvedValue({
            data: {
                user: { id: TEST_USER_ID }
            },
            error: null
        });

        // Setup default Supabase query mocks
        mockSupabase.from.mockReturnThis();
        mockSupabase.select.mockReturnThis();
        mockSupabase.eq.mockReturnThis();
        mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
        mockSupabase.update.mockResolvedValue({ data: null, error: null });

        // Setup default AI generation mock
        (generateText as Mock).mockResolvedValue({ text: TEST_GENERATED_TITLE });

        // Setup default title utility mocks
        (cleanTitle as Mock).mockReturnValue(TEST_GENERATED_TITLE);
        (updateTitleInDatabase as Mock).mockResolvedValue(true);

        // Mock environment variable
        process.env.INTERNAL_API_SECRET = MOCKED_SECRET;
    });

    afterEach(() => {
        delete process.env.INTERNAL_API_SECRET;
        vi.restoreAllMocks();
    });

    it('should successfully generate and save a title with internal secret', async () => {
        // Arrange
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': MOCKED_SECRET
            },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);
        const body = await response.json();

        // Assert
        expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();

        // Verify AI generation was called with correct parameters
        expect(generateText).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [
                    expect.objectContaining({ role: 'system' }),
                    expect.objectContaining({
                        role: 'user',
                        content: TEST_CONTENT
                    })
                ]
            })
        );

        // Verify title was cleaned
        expect(cleanTitle).toHaveBeenCalledWith(TEST_GENERATED_TITLE);

        // Verify title was saved to database
        expect(updateTitleInDatabase).toHaveBeenCalledWith(
            TEST_SESSION_ID,
            TEST_GENERATED_TITLE,
            TEST_USER_ID
        );

        // Verify success response
        expect(successResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_SESSION_ID,
                title: TEST_GENERATED_TITLE
            })
        );

        // Verify logging
        expect(titleLogger.titleGenerated).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_SESSION_ID,
                userId: TEST_USER_ID,
                generatedTitle: TEST_GENERATED_TITLE
            })
        );

        expect(edgeLogger.info).toHaveBeenCalled();

        expect(body.title).toBe(TEST_GENERATED_TITLE);
    });

    it('should successfully generate and save title with cookie auth (fallback)', async () => {
        // Arrange
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: TEST_USER_ID } }, error: null });
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);
        const body = await response.json();

        // Assert
        expect(mockSupabase.auth.getUser).toHaveBeenCalledTimes(1);
        expect(generateText).toHaveBeenCalledTimes(1);
        expect(updateTitleInDatabase).toHaveBeenCalledWith(
            TEST_SESSION_ID,
            TEST_GENERATED_TITLE,
            TEST_USER_ID
        );
        expect(successResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_SESSION_ID,
                title: TEST_GENERATED_TITLE
            })
        );

        expect(body.title).toBe(TEST_GENERATED_TITLE);
    });

    it('should return validation error when sessionId is missing', async () => {
        // Arrange
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Missing sessionId
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(validationError).toHaveBeenCalledWith('Session ID is required');
        expect(generateText).not.toHaveBeenCalled();
        expect(updateTitleInDatabase).not.toHaveBeenCalled();
    });

    it('should return validation error when content is missing', async () => {
        // Arrange
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                userId: TEST_USER_ID
                // Missing content
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(validationError).toHaveBeenCalledWith('Valid content is required for title generation');
        expect(generateText).not.toHaveBeenCalled();
        expect(updateTitleInDatabase).not.toHaveBeenCalled();
    });

    it('should return validation error when userId is missing in body', async () => {
        // Arrange
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(validationError).toHaveBeenCalledWith('User ID is required in the request body');
        expect(generateText).not.toHaveBeenCalled();
        expect(updateTitleInDatabase).not.toHaveBeenCalled();
    });

    it('should return unauthorized error when secret is missing/wrong AND cookie auth fails', async () => {
        // Arrange
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(response.status).toBe(401);
        expect(unauthorizedError).toHaveBeenCalledWith('Authentication required');
        expect(generateText).not.toHaveBeenCalled();
        expect(updateTitleInDatabase).not.toHaveBeenCalled();
    });

    it('should return unauthorized error when cookie auth user doesnt match body userId', async () => {
        // Arrange
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'different-user-id' } }, error: null });
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(response.status).toBe(401);
        expect(unauthorizedError).toHaveBeenCalledWith('Authentication required');
        expect(generateText).not.toHaveBeenCalled();
        expect(updateTitleInDatabase).not.toHaveBeenCalled();
    });

    it('should handle AI generation failures gracefully', async () => {
        // Arrange
        const aiError = new Error('AI model unavailable');
        (generateText as Mock).mockRejectedValue(aiError);

        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(response.status).toBe(500);
        expect(errorResponse).toHaveBeenCalledWith(
            'Failed during AI title generation',
            aiError,
            500
        );

        expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_SESSION_ID,
                userId: TEST_USER_ID,
                error: expect.stringContaining('AI title generation failed')
            })
        );

        expect(updateTitleInDatabase).not.toHaveBeenCalled();
    });

    it('should handle database update failures gracefully', async () => {
        // Arrange
        (updateTitleInDatabase as Mock).mockResolvedValue(false);

        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: TEST_SESSION_ID,
                content: TEST_CONTENT,
                userId: TEST_USER_ID
            })
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(response.status).toBe(500);
        expect(errorResponse).toHaveBeenCalledWith(
            'Failed to update title in database',
            null,
            500
        );

        // Verify AI was still generated
        expect(generateText).toHaveBeenCalled();
        expect(cleanTitle).toHaveBeenCalled();

        // Verify db update was attempted but failed
        expect(updateTitleInDatabase).toHaveBeenCalled();
    });

    it('should handle parsing errors gracefully', async () => {
        // Arrange
        const request = new Request('https://example.com/api/chat/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'invalid-json' // Invalid JSON
        });

        // Act
        const response = await POST(request);

        // Assert
        expect(response.status).toBe(400);
        expect(validationError).toHaveBeenCalledWith('Invalid request', expect.any(SyntaxError));

        expect(edgeLogger.error).toHaveBeenCalledWith(
            'Error in update-title handler',
            expect.objectContaining({
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_api_error'
            })
        );
    });
}); 