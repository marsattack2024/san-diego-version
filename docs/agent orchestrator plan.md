# Plan: Implement Sequential Processing for Complex, Streaming for Simple

**Goal:** Refactor the chat engine to handle both simple and complex user requests efficiently. Simple requests will use fast streaming responses, while complex requests will use synchronous, multi-step sequential processing on the server to ensure accuracy and structure, returning a final JSON response.

**Strategy: Sequential Processing for Complex, Streaming for Simple**
1.  **Lightweight Classification:** A fast, initial LLM call determines if a request is 'simple' (direct answer + optional tools via `maxSteps`) or 'complex' (requiring a predefined sequence of agent steps).
2.  **Simple Flow:** For simple requests, use `streamText` directly with the default agent configuration, leveraging `maxSteps` for tool usage (e.g., RAG). The response is a standard AI SDK stream.
3.  **Complex Flow:**
    *   Generate a quick, high-level plan (sequence of agent roles, e.g., `['google-ads', 'copyeditor']`).
    *   Execute the **entire sequence** of agent steps **synchronously on the server** using non-streaming `generateText` or `generateObject` calls. Pass the output of one step as input to the next.
    *   Persist the **final output** after all server-side steps complete.
    *   Trigger title generation asynchronously.
    *   Return a **standard JSON response** containing the final assistant message content (e.g., `{ role: 'assistant', content: '...' }`).

**Benefits:**
*   Fast streaming response for simple requests.
*   Ensures structured, multi-step execution for complex tasks (e.g., draft -> edit).
*   Avoids synchronous blocking before the response *starts* (but complex requests will wait for full completion).
*   Clear separation between streaming and non-streaming paths.
*   Aligns with Vercel AI SDK standard patterns ("Sequential Processing" for complex, "Multi-Step Tool Usage" for simple).

**Status:**
*   Backend API Route (`/api/chat/route.ts`) **needs refactoring** to implement the bifurcated (streaming/JSON) logic. (🔄 PENDING)
*   Frontend (`useChat` hook/component) **needs significant modification** to handle both streaming and non-streaming JSON responses. (🔄 PENDING CLIENT UPDATE)
*   Orchestrator (`orchestrator.service.ts`) **needs refactoring** to provide lightweight classification and plan generation, removing heavy synchronous execution. (🔄 PENDING)
*   Title Generation (`title-service.ts`, `title-utils.ts`, `/api/chat/update-title`) logic exists but needs correct triggering (from both `onFinish` for simple flow and after sync execution for complex flow). (📝 PENDING TRIGGER FIX)
*   Linter/TS config issues require manual investigation. (❗ ONGOING)

*Linter Note:* Persistent type errors related to `LOG_CATEGORIES.ORCHESTRATOR` and `AgentType` inference exist in `orchestrator.service.ts`. These likely require **manual investigation** of the project's TS/build configuration or restarting the TS server. Vitest type errors also require manual `tsconfig.json` review.

**Phase 1: Refactor Orchestrator & Core Types (Backend)**

*   **Goal:** Update the orchestrator service to perform lightweight classification and planning, removing synchronous execution.
*   **Steps:**
    1.  **(Types)** Modify `lib/chat-engine/types/orchestrator.ts`:
        *   Define a new type/interface for the classification result, e.g., `ClassificationResult { isSimple: boolean; suggestedAgent: AgentType; reasoning?: string; }`.
        *   Define a type for the plan result, e.g., `PlanResult = AgentType[]`.
        *   Remove or comment out types related to the old `prepareContext` and `OrchestrationContext`.
    2.  **(Orchestrator)** Refactor `lib/chat-engine/services/orchestrator.service.ts`:
        *   Implement the `classifyRequest(request: string): Promise<ClassificationResult>` function using `generateObject` with a fast model (e.g., `gpt-4o-mini`), appropriate system prompt, and the new `ClassificationResult` schema. Log appropriately. Ensure **no tools** are passed or executed here.
        *   Implement the `generatePlan(reqUrl=true
  hasAnonKey=true
  level=debug
🔵 01:11:29 Session authenticated (auth)
  userId=5c80...4...
  path=/api/chat/7b1ca5e3-fa6b-4db1-a6b9-2ce5d542f2ff/messages/count
  level=debug
🔵 01:11:29 Received raw request body
  operationId=chat_xaxz9w98
  rawBody={"message":{"id":"eaac5ced-bfb4-4f5b-8a77-eb8b3308cc71","createdAt":"2025-04-05T01:11:28.460Z","role":"user","content":"give me examples of optimize, alt text for photos on a website. ","parts":[{"type":"text","text":"give me examples of optimize, alt text for photos on a website. "}]},"id":"7b1ca5e3-fa6b-4db1-a6b9-2ce5d542f2ff","deepSearchEnabled":false,"agentId":"default"}
  level=debug
🔵 01:11:29 Validated request body
  operationId=chat_xaxz9w98
  body={"id":"7b1ca5e3-fa6b-4db1-a6b9-2ce5d542f2ff","message":{"id":"eaac5ced-bfb4-4f5b-8a77-eb8b3308cc71","role":"user","content":"give me examples of optimize, alt text for photos on a website. ","createdAt":"2025-04-05T01:11:28.460Z"},"deepSearchEnabled":false,"agentId":"default"}
  level=debug
🔵 01:11:29 Message persistence service initialized (system, chat_xaxz9w98)
  messageHistoryLimit=20
  throwErrors=false
  isWidgetChat=false
  disabled=false
  level=debug
🔵 01:11:29 Loading previous messages (chat_xaxz9w98)
  userId=5c80...20e9
  limit=20
  level=info
🔵 01:11:29 Creating Supabase client (system)
  hasSupabaseUrl=true
  hasAnonKey=true
  urlPrefix=https://uw...
  nodeEnv=development
  level=info
🔵 01:11:29 Creating route handler Supabase client (system)
  hasSupabaseUrl=true
  hasAnonKey=true
  level=debug
🔵 01:11:29 Messages loaded successfully (chat_xaxz9w98)
  count=20
  executionTimeMs=155
  level=info
🔵 01:11:29 AgentOrchestrator initialized (orchestrator)
  model=gpt-4o-mini
  level=info
🔵 01:11:29 Orchestrator prepareContext started (orchestrator, prepare_context_start)
  operationId=prep_ctx_m93ipuyz
  requestPreview=give me examples of optimize, alt text for photos on a website. ...
  level=info
🔵 01:11:29 Generating workflow plan (incl. complexity assessment) (orchestrator, generate_plan)
  operationId=plan_m93ipuyz
  requestPreview=give me examples of optimize, alt text for photos on a website. ...
  initialAgentHint=default
  level=info
🔵 01:11:29 generatePlan: Prompt sent to model (orchestrator)
  operationId=plan_m93ipuyz
  systemPrompt=You are a highly intelligent workflow manager. Your tasks are:
1. Analyze the user request and any user agent hint provided.
2. Determine if the request is SIMPLE (can be answered directly by the 'default' agent, possibly using RAG/tools) or COMPLEX (requires specialized generation or multiple distinct steps).
3. Generate a workflow plan object based on your determination:
    - If SIMPLE (e.g., answering questions, researching topics, summarizing info, using tools directly): Create a plan with ONLY ONE step using the 'default' agent (or the user's hinted agent if appropriate) with the task: "Answer the user query directly using available context and tools."
    - If COMPLEX (e.g., user *explicitly* asks for marketing copy, ad campaigns, quizzes, or specific text editing): Create a detailed multi-step plan (typically 2-3 steps, max 5) using the most appropriate specialized agents. 
        - Use 'researcher' ONLY if significant external information gathering beyond simple tool calls is clearly needed as a distinct first step.
        - Use 'copywriting', 'google-ads', 'facebook-ads', 'quiz' ONLY when the user explicitly asks for that specific type of creative output.
        - Use 'copyeditor' ONLY when the user explicitly asks for text to be edited or refined, or if a previous generation step explicitly requires it.
        - Ensure the final step produces the user-facing output.
Available specialized agents: copywriting, google-ads, facebook-ads, quiz, researcher, copyeditor. 
STRONGLY PREFER the single 'default' agent plan unless a specialized generation agent is clearly and explicitly requested by the user.
  prompt=User Request: "give me examples of optimize, alt text for photos on a website. "
User Agent Hint: default

Analyze this request and generate the appropriate workflow plan (either single-step simple or multi-step complex) based on your system instructions. Ensure the plan achieves the user's goal.
  level=debug
🔵 01:11:29 Counting chat messages (chat, count_chat_messages)
  operationId=count_nk2cdn75
  chatId=7b1ca5e3
  userId=5c80...df74
  level=info
🔵 01:11:29 Redis REST API connection successful (system, redis_init_success)
  level=info
🔵 01:11:29 Successfully counted chat messages (chat, count_chat_messages)
  operationId=count_nk2cdn75
  chatId=7b1ca5e3
  count=43
  level=info
 GET /api/chat/7b1ca5e3-fa6b-4db1-a6b9-2ce5d542f2ff/messages/count 200 in 602ms
🔵 01:11:30 generatePlan: generateObject call completed (orchestrator, 890ms, generate_plan_llm_call)
  operationId=plan_m93ipuyz
  slow=false
  important=false
  usage={"promptTokens":556,"completionTokens":25,"totalTokens":581}
  finishReason=stop
  warnings=[]
  level=info
🔵 01:11:30 Workflow plan generation completed (orchestrator, 890ms, generate_plan_success)
  operationId=plan_m93ipuyz
  stepCount=1
  planPreview=["default"]
  slow=false
  important=false
  llmDurationMs=890
  level=info
🔵 01:11:30 Simple ["default"] plan detected. Skipping synchronous execution step. (orchestrator, prepare_context_skip_execution)
  operationId=prep_ctx_m93ipuyz
  planPreview=[default]
  level=info
🔵 01:11:30 Orchestrator prepareContext finished successfully (Simple Plan) (orchestrator, 891ms, prepare_context_success)
  operationId=prep_ctx_m93ipuyz
  contextMessageCount=0
  targetModelId=gpt-4o-mini
  planType=simple
  level=info
🔵 01:11:30 Creating custom tool set (tools, create_tool_set)
  useKnowledgeBase=true
  useWebScraper=true
  useDeepSearch=true
  useProfileContext=true
  level=info
🔵 01:11:30 Preparing to call streamText
  operationId=chat_xaxz9w98
  userId=5c80...d...
  targetModelId=gpt-4o-mini
  contextMessageCount=0
  historyMessageCount=20
  systemPromptLength=4744
  toolCount=4
  toolNames=[getInformation, scrapeWebContent, deepSearch, getUserProfileContext]
  level=debug
🔵 01:11:30 Saving user message (chat_xaxz9w98)
  operationId=save_user_msg_xvxj3k
  userId=5c80...20e9
  messageId=eaac5ced-bfb4-4f5b-8a77-eb8b3308cc71
  contentPreview=give me examples of optimize, alt text for photos ...
  level=info
🔵 01:11:30 Saving message to database (chat_xaxz9w98)
  role=user
  userId=5c80...20e9
  messageId=eaac5ced-bfb4-4f5b-8a77-eb8b3308cc71
  contentLength=64
  hasToolsUsed=false
  level=info
🔵 01:11:30 AI Stream Service initialized (system)
  level=info
🔵 01:11:30 Calling AIStreamService process
  operationId=chat_xaxz9w98
  level=debug
🔵 01:11:30 Starting AI stream processing (llm, chat_xaxz9w98)
  userId=5c80...20e9
  model=gpt-4o-mini
  hasTools=true
  temperature=0.5
  maxTokens=4096
  level=debug
🔵 01:11:30 Tools configuration passed to streamText (tools, chat_xaxz9w98)
  toolCount=4
  toolNames=[getInformation, scrapeWebContent, deepSearch, getUserProfileContext]
  toolDetails=[{"name":"getInformation","hasDescription":true,"hasExecute":true,"parametersType":"object"},{"name":"scrapeWebContent","hasDescription":true,"hasExecute":true,"parametersType":"object"},{"name":"deepSearch","hasDescription":true,"hasExecute":true,"parametersType":"object"},{"name":"getUserProfileContext","hasDescription":true,"hasExecute":true,"parametersType":"object"}]
  level=debug
🔵 01:11:30 Standardized messages (chat, standardize_messages)
  operationId=chat_xaxz9w98
  originalCount=41
  standardizedCount=41
  level=debug
🔵 01:11:30 Processing standardized messages for AI stream (llm, chat_xaxz9w98)
  messageCount=41
  roles=[user, assistant, user, assistant, user, assistant, user, assistant, user, assistant, user, assistant, user, assistant, user, user, user, user, assistant, user, user, assistant, user, assistant, user, assistant, user, assistant, user, assistant, user, assistant, user, assistant, user, user, user, user, assistant, user, user]
  firstMessage={"id":"dc8405ba-d957-4cfa-9d5b-fe346695d135","role":"user","content":"How do I make sure my ads don't get rejected?"}
  level=debug
🔵 01:11:30 Converted messages to CoreMessage format (llm, chat_xaxz9w98)
  coreMessageCount=41
  level=debug
🔵 01:11:30 Injected context message for tool execution (llm, chat_xaxz9w98)
  injectedContextKeys=[id, message, deepSearchEnabled, agentId, userId]
  level=debug
🔵 01:11:30 AI Stream: Background consumption enabled (llm, chat_xaxz9w98)
  level=debug
🔵 01:11:30 AI stream processing complete, returning response (llm, 1187ms, chat_xaxz9w98)
  level=info
🔵 01:11:30 AIStreamService process returned
  operationId=chat_xaxz9w98
  level=debug
🔵 01:11:30 API request completed successfully (chat, 1188ms)
  operationId=chat_xaxz9w98
  method=POST
  path=/api/chat
  status=200
  slow=false
  important=false
  level=info
🔵 01:11:30 Message saved successfully via RPC (chat_xaxz9w98)
  messageId=eaac5ced-bfb4-4f5b-8a77-eb8b3308cc71
  executionTimeMs=343
  rpcSuccess=true
  level=info
🔵 01:11:30 Knowledge base search started (tools, rag_search)
  operationId=rag-m93ipwa2
  toolCallId=call_xM9aZtUCQi2F4yaDOdz8zcGD
  queryLength=41
  queryPreview=optimize alt text fo...
  level=info
🔵 01:11:30 Starting RAG operation with cache check (tools, rag_search)
  ragOperationId=rag-m93ipwa3
  queryLength=41
  queryPreview=optimize alt text fo...
  limit=5
  similarityThreshold=0.7
  metadataFilterApplied=false
  level=info
🔵 01:11:31 Cache get (system)
  key=app:rag:a56a6f9ae09f3927
  hit=false
  level=debug
🔵 01:11:31 RAG cache check completed (tools, rag_cache_check)
  ragOperationId=rag-m93ipwa3
  cacheHit=false
  level=debug
🔵 01:11:31 Creating embedding
  text_length=41
  level=info
 GET /api/chat/7b1ca5e3-fa6b-4db1-a6b9-2ce5d542f2ff/messages/count 200 in 411ms
🔵 01:11:31 Successfully created embedding
  text_length=41
  duration_ms=856
  model=text-embedding-3-small
  level=info
🔵 01:11:32 Cache set (system)
  key=app:rag:a56a6f9ae09f3927
  ttl=43200
  level=debug
🔵 01:11:32 RAG search completed (tools, 1151ms, rag_search)
  ragOperationId=rag-m93ipwa3
  documentCount=2
  documentIds=[14536, 14924]
  topSimilarityScore=0.648639121570536
  avgSimilarityScore=0.634872761096118
  similarityRange=0.621-0.649
  retrievalTimeMs=1151
  source=search
  slow=false
  important=false
  status=completed
  level=info
🔵 01:11:32 Knowledge base search completed (tools, 1193ms, rag_search)
  operationId=rag-m93ipwa2
  toolCallId=call_xM9aZtUCQi2F4yaDOdz8zcGD
  resultsCount=2
  documentIds=[14536, 14924]
  topSimilarityScore=0.648639121570536
  avgSimilarityScore=0.634872761096118
  similarityRange=0.621-0.649
  contentLength=6779
  metadataTypes=[unknown]
  retrievalTimeMs=1151
  slow=false
  important=false
  status=completed
  queryLength=41
  level=info
🔵 01:11:32 AI Stream: Step completed (llm, chat_xaxz9w98)
  hasText=false
  toolCallCount=1
  toolResultCount=1
  finishReason=tool-calls
  usage={"promptTokens":5925,"completionTokens":23,"totalTokens":5948}
  level=debug
🔵 01:11:32 Tool call details (tools, chat_xaxz9w98)
  toolName=getInformation
  toolCallId=call_xM9aZtUCQi2F4yaDOdz8zcGD
  argsPreview={"query":"optimize alt text for photos on a website"}
  fullArgs={"query":"optimize alt text for photos on a website"}
  level=debug
🔵 01:11:32 AI Stream: Tool calls executed in step (tools, chat_xaxz9w98)
  toolNames=[getInformation]
  level=info
🔵 01:11:32 Tool results received (tools, chat_xaxz9w98)
  toolResultCount=1
  toolResultsPreview=[{"toolCallId":"call_xM9aZtUCQi2F4yaDOdz8zcGD","contentLength":0,"contentPreview":"none"}]
  level=debug
🔵 01:11:42 AI Stream: Step completed (llm, chat_xaxz9w98)
  hasText=true
  toolCallCount=0
  toolResultCount=0
  finishReason=stop
  usage={"promptTokens":9119,"completionTokens":522,"totalTokens":9641}
  level=debug
🔵 01:11:42 AI Stream: Finished (llm, chat_xaxz9w98)
  textLength=2633
  usage={"promptTokens":15044,"completionTokens":545,"totalTokens":15589}
  finalToolCallCount=1
  level=info
🔵 01:11:42 AIStreamService: onFinish callback started (llm)
  operationId=chat_xaxz9w98
  finishReason=callback_invoked
  textLength=2633
  usage={"promptTokens":15044,"completionTokens":545,"totalTokens":15589}
  toolCallCount=1
  level=info
🔵 01:11:42 Formatted tool calls for persistence (in Service Callback)
  operationId=chat_xaxz9w98
  toolCount=1
  toolNames=[getInformation]
  level=info
🔵 01:11:42 Creating Supabase client (repeated 2 times) (system)
  hasSupabaseUrl=true
  hasAnonKey=true
  urlPrefix=https://uw...
  nodeEnv=development
  level=info
🔵 01:11:42 Title already exists for chat (chat, title_exists)
  chatId=7b1ca5e3-fa6b-4db1-a6b9-2ce5d542f2ff
  userId=5c80...20e9
  titlePreview=Preventing Ad Rejection: Best ...
  important=false
  level=info
🔵 01:11:42 Skipping title generation (in Service Callback) (chat)
  operationId=chat_xaxz9w98
  level=info
🔵 01:11:42 Saving assistant message (chat_xaxz9w98)
  operationId=save_assistant_msg_oizeyk
  userId=5c80...20e9
  messageId=f01f572b-06bd-4aca-8892-00f521df3822
  contentPreview=Here are some examples of optimized alt text for p...
  hasToolsUsed=true
  toolsCount=1
  toolNames=[getInformation]
  level=info
🔵 01:11:42 Saving message to database (chat_xaxz9w98)
  role=assistant
  userId=5c80...20e9
  messageId=f01f572b-06bd-4aca-8892-00f521df3822
  contentLength=2633
  hasToolsUsed=true
  level=info
🔵 01:11:43 Message saved successfully via RPC (chat_xaxz9w98)
  messageId=f01f572b-06bd-4aca-8892-00f521df3822
  executionTimeMs=144
  rpcSuccess=true
  level=info
🔵 01:11:43 Assistant message saved successfully (in Service Callback) (145ms)
  operationId=chat_xaxz9w98
  contentLength=2633
  level=info
🔵 01:11:43 AIStreamService: onFinish callback completed (llm)
  operationId=chat_xaxz9w98
  level=info
 POST /api/chat 200 in 14211msuest: string, complexAgent: AgentType): Promise<PlanResult>` function using `generateObject` to output *only* the sequence of agent roles based on the nature of the complex task (e.g., `['google-ads', 'copyeditor']`). Log appropriately. Ensure **no tools** are passed or executed here.
        *   Deprecate/remove the `prepareContext`, `executePlanAndGatherContext`, `run`, and `compileResults` methods. Keep constructor and logger initialization.
    3.  **(Agent Router)** Review `lib/chat-engine/agent-router.ts`: Ensure `getAgentConfig` and `createAgentToolSet` correctly provide configurations and toolsets for all necessary agents ('default', 'google-ads', 'copyeditor', etc.).
    4.  **(Testing - Initial):** Add/update unit tests for the new `classifyRequest` and `generatePlan` methods in `orchestrator.service.test.ts`. (Note: Still blocked by potential TS/Vitest config issues).

**Phase 2: Refactor API Route & Title Trigger (Backend)**

*   **Goal:** Implement the bifurcated API route logic for simple (streaming) and complex (synchronous JSON) responses.
*   **Steps:**
    1.  **(API Route)** Modify `app/api/chat/route.ts`:
        *   Remove the call to the old `orchestrator.prepareContext`.
        *   After auth/validation/history loading, call `orchestrator.classifyRequest(userMessage.content)`.
        *   Implement the `if (classification.isSimple)` block:
            *   Get config/tools for `'default'`.
            *   Call `streamText` with default config, messages, tools, and `maxSteps: 5`.
            *   Implement the `onFinish` callback:
                *   Call `persistenceService.saveAssistantMessage(...)` with the final `text`.
                *   Call `triggerTitleGenerationViaApi(...)`.
                *   Add logging and basic error handling.
            *   Return `result.toDataStreamResponse()`.
        *   Implement the `else` block (for `!classification.isSimple` - **Synchronous Execution**):
            *   Call `orchestrator.generatePlan(...)`.
            *   Initialize `intermediateResult` (likely with user message or relevant context).
            *   `try...catch` block for the sequence:
                *   Loop through the `plan` (e.g., `['google-ads', 'copyeditor']`).
                *   Inside the loop:
                    *   Get config for the current step's agent.
                    *   Call **`generateText` (non-streaming)** using the current agent's config/prompt and the `intermediateResult` from the previous step.
                    *   Update `intermediateResult` with the output of this step.
                    *   Add specific logging for each step completion.
                *   Let `finalResult = intermediateResult`.
            *   After the loop (or in `finally` if using try/finally for cleanup):
                *   Call `persistenceService.saveAssistantMessage(...)` with `finalResult`.
                *   Call `triggerTitleGenerationViaApi(...)`.
                *   Add comprehensive logging for the full sequence completion or errors.
            *   If successful, return **`Response.json({ role: 'assistant', content: finalResult }, { status: 200 })`**.
            *   If sequence errored, return an appropriate error `Response.json(...)`.
        *   Add top-level error handling for the API route.

**Phase 3: Frontend Handling & Testing (Client/Full Stack)**

*   **Goal:** Implement client-side logic to handle both streaming and standard JSON responses, ensure robustness, and conduct thorough testing.
*   **Steps:**
    1.  **(Frontend Chat Component / Hook):** Modify the form submission logic:
        *   **Determine Response Type:** Decide how the client knows whether to expect a stream or JSON. Options:
            *   a) Make an initial lightweight API call to `classifyRequest` first.
            *   b) Send the main request and check the `Content-Type` header of the response (`text/event-stream` vs `application/json`). (More common).
        *   **If Streaming Expected:** Use `useChat`'s `handleSubmit` or `append` as normal.
        *   **If JSON Expected:**
            *   Manually call `fetch` to `app/api/chat/route.ts`.
            *   Display a loading indicator.
            *   On successful JSON response:
                *   Use `setMessages` (from `useChat`) to add the user's message and the received assistant message (`{ role: 'assistant', content: responseData.content }`) to the chat display.
            *   Handle fetch errors, display error messages in the UI.
    2.  **(Logging & Observability)** Review and enhance logging across all modified files, focusing on clarity, performance tracking (durationMs for complex sequences), error details, adhering to `logging-rules.mdc`.
    3.  **(Error Handling)** Add specific `try...catch` blocks around critical sections: classification, planning, each `generateText` call in the synchronous loop, persistence calls, and title trigger calls. Ensure errors are communicated to the client appropriately via the JSON response for the complex path.
    4.  **(Testing - Comprehensive):**
        *   Resolve TS/Vitest configuration issues (Manual Step).
        *   Run/update unit tests for the orchestrator.
        *   Add integration tests for `app/api/chat/route.ts`:
            *   Test simple streaming path (with/without tool use).
            *   Test complex non-streaming JSON path (e.g., 2-step plan). Verify sequential execution, final persisted output, title trigger, and correct JSON response.
            *   Test various error conditions for both paths.
        *   Perform manual E2E testing using the UI for both simple and complex prompts, verifying the streaming behavior for simple and the loader + final message display for complex flows.

**Key Considerations & Adherence to Rules:**

*   **Agents:** Uses specific agent configs (`google-ads`, `copyeditor`, etc.) executed sequentially via `generateText` for complex tasks.
*   **Strategy:** Implements "Sequential Processing for Complex, Streaming for Simple".
*   **Vercel AI SDK:** Utilizes `generateObject` for classification/planning; `streamText` for simple flow; `generateText` for complex flow steps. Requires frontend changes to handle non-streaming responses.
*   **Modularity:** Orchestrator handles classification/planning; API route handles request lifecycle, streaming/synchronous execution; Persistence service handles DB.
*   **Logging:** Requires updates for new flow, tracking duration of complex sequences.
*   **Routing:** Logic handled within `/api/chat`.
*   **ESM:** Assumes ESM syntax.