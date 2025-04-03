// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import type { CoreMessage } from 'ai';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import type { SupabaseClient } from '@supabase/supabase-js';

// 2. Mocks
setupLoggerMock();

// Mock the *correct* client factory path
vi.mock('@/lib/supabase/route-client');

// 3. Import module under test
import { profileContextTool } from '@/lib/tools/profile-context.tool';

// 4. Test Suite
describe('Profile Context Tool', () => {

    const mockUserId = 'test-user-id-123';
    const mockSessionId = 'test-session-abc';
    const mockToolCallId = 'tool-call-xyz';

    let mockSingle: Mock; // Mock for the final .single() call

    const createMockRunOptions = (contextBody: Record<string, any> | null): any => {
        const messages: CoreMessage[] = [
            { role: 'system', content: contextBody ? JSON.stringify(contextBody) : 'invalid json or not context' } as CoreMessage,
            { role: 'user', content: 'Please write some ad copy for my business.' } as CoreMessage
        ];
        return {
            toolCallId: mockToolCallId,
            messages: messages
        };
    };

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Define mock for the .single() method result
        mockSingle = vi.fn();

        // Mock the chainable structure
        vi.mocked(createRouteHandlerClient).mockImplementation(async () => ({
            from: vi.fn().mockReturnThis(), // Mock from to return itself (or the next part)
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({ // eq returns object with single
                single: mockSingle
            }),
        } as any)); // Use 'as any' to simplify mocking the chain

        // Set default resolved value for .single()
        mockSingle.mockResolvedValue({ data: {}, error: null });
    });

    it('should return profile context when userId is found and profile exists', async () => {
        const contextBody = { userId: mockUserId, sessionId: mockSessionId };
        const runOptions = createMockRunOptions(contextBody);
        const mockProfileData = {
            full_name: 'John Doe',
            company_name: 'JD Photography',
            website_url: 'https://jdphoto.com',
            company_description: 'Capturing moments.',
            location: 'New York, NY',
            website_summary: 'Specializes in portraits.'
        };
        // Configure the mock result specifically for this test
        mockSingle.mockResolvedValue({ data: mockProfileData, error: null });

        const result = await profileContextTool.execute({}, runOptions as any);

        // Assertions (Focus on the outcome and the final mock call)
        expect(createRouteHandlerClient).toHaveBeenCalledTimes(1);
        expect(mockSingle).toHaveBeenCalledTimes(1);
        expect(result).toContain('User Profile Context:');
        expect(result).toContain('- Name: John Doe');
        expect(result).toContain('- Company: JD Photography');
        expect(result).toContain('- Location: New York, NY');
        expect(result).toContain('- Website: https://jdphoto.com');
        expect(result).toContain('- Description: Capturing moments.');
        expect(result).toContain('- Website Summary: Specializes in portraits.');
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Profile Context Tool execution successful',
            expect.objectContaining({ userId: mockUserId })
        );
    });

    it('should return specific message when no profile data is found', async () => {
        const contextBody = { userId: mockUserId, sessionId: mockSessionId };
        const runOptions = createMockRunOptions(contextBody);
        // Configure mock result
        mockSingle.mockResolvedValue({ data: null, error: null });

        const result = await profileContextTool.execute({}, runOptions as any);

        expect(mockSingle).toHaveBeenCalledTimes(1);
        expect(result).toContain('No profile data found');
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'No profile data found for user',
            expect.objectContaining({ userId: mockUserId })
        );
    });

    it('should return error message if userId is not found in context', async () => {
        const contextBody = { sessionId: mockSessionId }; // Missing userId
        const runOptions = createMockRunOptions(contextBody);

        const result = await profileContextTool.execute({}, runOptions as any);

        expect(result).toContain('Error: Could not determine the user');
        expect(createRouteHandlerClient).not.toHaveBeenCalled(); // Database not called
    });

    it('should return error message if context message is missing or invalid', async () => {
        const runOptions = { toolCallId: mockToolCallId, messages: [{ role: 'user', content: 'Hello' } as CoreMessage] };
        const result = await profileContextTool.execute({}, runOptions as any);

        expect(result).toContain('Error: Could not determine the user');
        expect(createRouteHandlerClient).not.toHaveBeenCalled();
    });

    it('should return error message if Supabase query fails', async () => {
        const contextBody = { userId: mockUserId, sessionId: mockSessionId };
        const runOptions = createMockRunOptions(contextBody);
        const dbError = new Error('Connection failed');
        // Configure mock error
        mockSingle.mockResolvedValue({ data: null, error: dbError });

        const result = await profileContextTool.execute({}, runOptions as any);

        expect(mockSingle).toHaveBeenCalledTimes(1);
        expect(result).toContain('Error: Failed to fetch user profile data');
        expect(result).toContain('Connection failed');
        expect(mockLogger.error).toHaveBeenCalledWith(
            'Error fetching user profile from Supabase',
            expect.objectContaining({ error: dbError.message, important: true })
        );
    });

    it('should only include non-null fields in the output string', async () => {
        const contextBody = { userId: mockUserId, sessionId: mockSessionId };
        const runOptions = createMockRunOptions(contextBody);
        const mockProfileData = {
            full_name: 'Jane Doe',
            company_name: null, // Missing company name
            website_url: 'https://jane.com',
            company_description: null,
            location: 'London',
            website_summary: 'Portraits.'
        };
        // Configure mock result
        mockSingle.mockResolvedValue({ data: mockProfileData, error: null });

        const result = await profileContextTool.execute({}, runOptions as any);

        expect(result).toContain('- Name: Jane Doe');
        expect(result).toContain('- Location: London');
        expect(result).toContain('- Website: https://jane.com');
        expect(result).toContain('- Website Summary: Portraits.');
        expect(result).not.toContain('- Company:');
        expect(result).not.toContain('- Description:');
    });

}); 