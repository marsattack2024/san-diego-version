// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import type { CoreMessage } from 'ai';

// 2. Mocks
setupLoggerMock();

// Mock Supabase client
const mockSelect = vi.fn().mockReturnThis();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({
    select: mockSelect,
    eq: mockEq,
}));
const mockSupabaseClient = {
    from: mockFrom,
};
vi.mock('@/lib/supabase/route-client', () => ({
    createRouteHandlerClient: vi.fn(() => Promise.resolve(mockSupabaseClient)) // Ensure it returns a Promise
}));

// 3. Import module under test
import { profileContextTool } from '@/lib/tools/profile-context.tool';

// 4. Test Suite
describe('Profile Context Tool', () => {

    const mockUserId = 'test-user-id-123';
    const mockSessionId = 'test-session-abc';
    const mockToolCallId = 'tool-call-xyz';

    const createMockRunOptions = (contextBody: Record<string, any> | null): any => ({
        toolCallId: mockToolCallId,
        messages: [
            { role: 'system', content: contextBody ? JSON.stringify(contextBody) : 'invalid json or not context' },
            { role: 'user', content: 'Please write some ad copy for my business.' }
        ]
    });

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();
        // Reset specific Supabase mocks
        mockSelect.mockReturnThis();
        mockEq.mockImplementation(() => ({ single: mockSingle })); // Ensure eq returns object with single
        mockSingle.mockClear();
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
        mockSingle.mockResolvedValue({ data: mockProfileData, error: null });

        const result = await profileContextTool.execute({}, runOptions);

        expect(mockFrom).toHaveBeenCalledWith('sd_user_profiles');
        expect(mockSelect).toHaveBeenCalledWith('full_name, company_name, website_url, company_description, location, website_summary');
        expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
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
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return specific message when no profile data is found', async () => {
        const contextBody = { userId: mockUserId, sessionId: mockSessionId };
        const runOptions = createMockRunOptions(contextBody);
        mockSingle.mockResolvedValue({ data: null, error: null }); // Simulate profile not found

        const result = await profileContextTool.execute({}, runOptions);

        expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
        expect(mockSingle).toHaveBeenCalledTimes(1);
        expect(result).toContain('No profile data found');
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'No profile data found for user',
            expect.objectContaining({ userId: mockUserId })
        );
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return error message if userId is not found in context', async () => {
        const contextBody = { sessionId: mockSessionId }; // Missing userId
        const runOptions = createMockRunOptions(contextBody);

        const result = await profileContextTool.execute({}, runOptions);

        expect(result).toContain('Error: Could not determine the user');
        expect(mockLogger.error).toHaveBeenCalledWith(
            'User ID not found in execution context for Profile Context Tool',
            expect.objectContaining({ important: true })
        );
        expect(mockFrom).not.toHaveBeenCalled(); // Should not attempt DB query
    });

    it('should return error message if context message is missing or invalid', async () => {
        const runOptions = { toolCallId: mockToolCallId, messages: [{ role: 'user', content: 'Hello' }] }; // No system message

        const result = await profileContextTool.execute({}, runOptions);

        expect(result).toContain('Error: Could not determine the user');
        expect(mockLogger.error).toHaveBeenCalledWith(
            'User ID not found in execution context for Profile Context Tool',
            expect.objectContaining({ important: true })
        );
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should return error message if Supabase query fails', async () => {
        const contextBody = { userId: mockUserId, sessionId: mockSessionId };
        const runOptions = createMockRunOptions(contextBody);
        const dbError = new Error('Connection failed');
        mockSingle.mockResolvedValue({ data: null, error: dbError }); // Simulate DB error

        const result = await profileContextTool.execute({}, runOptions);

        expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
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
        mockSingle.mockResolvedValue({ data: mockProfileData, error: null });

        const result = await profileContextTool.execute({}, runOptions);

        expect(result).toContain('- Name: Jane Doe');
        expect(result).toContain('- Location: London');
        expect(result).toContain('- Website: https://jane.com');
        expect(result).toContain('- Website Summary: Portraits.');
        expect(result).not.toContain('- Company:');
        expect(result).not.toContain('- Description:');
    });

}); 