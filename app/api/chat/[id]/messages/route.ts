import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';
import { successResponse, errorResponse, validationError, unauthorizedError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';
import { handleCors } from '@/lib/utils/http-utils';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { type User } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;

/**
 * GET handler to retrieve paginated messages for a specific chat (Using Pattern B - Direct Export)
 */
export async function GET(
    request: Request,
    { params }: IdParam // Use specific type and destructure params promise
): Promise<Response> {
    const operationId = `get_msgs_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Manually create client and check auth
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for getting messages', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                error: authError?.message || 'No authenticated user',
            });
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }

        // Await params *after* auth check
        const resolvedParams = await params; // Await the destructured params promise
        const chatId = resolvedParams.id;

        // Validate chatId after resolution
        if (!chatId) {
            const errRes = validationError('Chat ID is required');
            return handleCors(errRes, request, true);
        }

        // Extract pagination params from URL
        const url = new URL(request.url);
        const pageParam = url.searchParams.get('page');
        const pageSizeParam = url.searchParams.get('pageSize');

        const page = pageParam ? parseInt(pageParam, 10) : 1;
        const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : DEFAULT_PAGE_SIZE;
        const offset = (page - 1) * pageSize;

        // Validate pagination params
        if (isNaN(page) || page < 1) {
            return handleCors(validationError('Invalid page number'), request, true);
        }
        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) { // Add upper limit
            return handleCors(validationError(`Invalid page size (must be 1-${DEFAULT_PAGE_SIZE * 5})`), request, true);
        }

        edgeLogger.info('Fetching chat messages', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            chatId: chatId.slice(0, 8),
            userId: user.id.substring(0, 8),
            page,
            pageSize,
            offset
        });

        // Fetch messages (assuming RLS)
        const { data: messages, error } = await supabase
            .from('sd_chat_histories')
            .select('role, content')
            .eq('session_id', chatId)
            .order('created_at', { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (error) {
            edgeLogger.error('Error fetching chat messages', {
                category: LOG_CATEGORIES.DB,
                operationId,
                error: error.message,
                chatId: chatId.slice(0, 8)
            });
            const errRes = errorResponse('Failed to fetch messages', error);
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Successfully fetched chat messages', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            chatId: chatId.slice(0, 8),
            count: messages?.length || 0,
            page,
            pageSize
        });

        // Format messages for Vercel AI SDK, handling role mismatches
        const formattedMessages: Message[] = messages?.map(msg => {
            let role: Message['role'];
            switch (msg.role) {
                case 'user':
                case 'assistant':
                case 'system':
                case 'data': // Assuming 'data' is supported by your Message type variant
                    role = msg.role;
                    break;
                case 'function': // Map 'function' if necessary, e.g., to 'tool' or omit
                    // For simplicity, let's map function/tool to assistant for now
                    // or filter them out if they shouldn't reach the AI SDK client
                    role = 'assistant'; // Or potentially filter: return null;
                    break;
                case 'tool':
                    role = 'assistant'; // Map 'tool' to assistant if not directly supported
                    break;
                default:
                    // Handle unexpected roles, maybe default or log an error
                    edgeLogger.warn('Unsupported message role encountered', { operationId, role: msg.role });
                    role = 'assistant'; // Defaulting unknown roles
            }

            return {
                id: Math.random().toString(36).substring(2, 15), // AI SDK might need IDs
                role: role, // Use the validated/mapped role
                content: msg.content
            };
        }).filter(msg => msg !== null) as Message[] || []; // Filter out nulls if you chose to filter roles

        const response = successResponse({ messages: formattedMessages });
        return handleCors(response, request, true);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        edgeLogger.error('Unexpected error fetching chat messages', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            error: errorMsg
        });
        const errRes = errorResponse('Unexpected error fetching chat messages', error, 500);
        return handleCors(errRes, request, true);
    }
} 