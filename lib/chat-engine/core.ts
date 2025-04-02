/**
 * @deprecated This file is being replaced by the new chat-engine.facade.ts implementation
 * that follows the Facade pattern and Single Responsibility Principle.
 * 
 * Import from 'lib/chat-engine/chat-engine.facade.ts' directly instead.
 * 
 * This file now re-exports the facade components for backward compatibility
 * during the transition period.
 */

import { ChatEngineFacade, createChatEngine } from './chat-engine.facade';
import type { ChatEngineConfig } from './chat-engine.config';
import type { ChatEngineContext } from './types';

// Re-export the facade as the original ChatEngine for backward compatibility
/**
 * @deprecated Use ChatEngineFacade from 'lib/chat-engine/chat-engine.facade.ts' instead.
 * This class is maintained for backward compatibility during the transition period.
 */
export class ChatEngine extends ChatEngineFacade {
    constructor(config: ChatEngineConfig) {
        // Initialize required services using the factory function
        const { apiAuthService, chatContextService, aiStreamService, persistenceService } = (() => {
            const facade = createChatEngine(config);
            // Access private fields via type assertion
            return {
                apiAuthService: (facade as any).apiAuthService,
                chatContextService: (facade as any).chatContextService,
                aiStreamService: (facade as any).aiStreamService,
                persistenceService: (facade as any).persistenceService
            };
        })();

        // Pass all required parameters to the parent constructor
        super(
            config,
            apiAuthService,
            chatContextService,
            aiStreamService,
            persistenceService
        );

        console.warn(
            'WARNING: The ChatEngine class from core.ts is deprecated. ' +
            'Use ChatEngineFacade from chat-engine.facade.ts instead.'
        );
    }
}

// Re-export the factory function
export { createChatEngine };

// Re-export types for backward compatibility
export type { ChatEngineConfig, ChatEngineContext }; 