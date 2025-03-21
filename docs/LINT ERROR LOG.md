
./app/(auth)/layout.tsx
1:10  Error: 'AuthButton' is defined but never used.  no-unused-vars
9:13  Error: 'React' is not defined.  no-undef

./app/admin/layout.tsx
12:63  Error: 'React' is not defined.  no-undef

./app/admin/page.tsx
11:9  Error: 'isMobile' is assigned a value but never used.  no-unused-vars

./app/admin/users/page.tsx
66:10  Error: 'isDeleting' is assigned a value but never used.  no-unused-vars

./app/api/admin/dashboard/route.ts
58:27  Error: 'request' is defined but never used.  no-unused-vars

./app/api/admin/users/[userId]/route.ts
181:11  Error: 'tablesWithoutCascade' is assigned a value but never used.  no-unused-vars

./app/api/admin/users/route.ts
82:27  Error: 'request' is defined but never used.  no-unused-vars
132:19  Error: 'tables' is assigned a value but never used.  no-unused-vars

./app/api/auth/layout.tsx
4:13  Error: 'React' is not defined.  no-undef

./app/api/chat/[id]/route.ts
3:10  Error: 'createServerClient' is defined but never used.  no-unused-vars
4:32  Error: 'createSupabaseServerClient' is defined but never used.  no-unused-vars
5:10  Error: 'cookies' is defined but never used.  no-unused-vars
10:1  Error: Import in body of module; reorder to top.  import/first

./app/api/chat/route.ts
9:23  Error: 'ensureProtocol' is defined but never used.  no-unused-vars
30:7  Error: 'comprehensiveScraperSchema' is assigned a value but never used.  no-unused-vars
41:11  Error: 'cookieStore' is assigned a value but never used.  no-unused-vars

./app/api/chat/session/route.ts
3:10  Error: 'createServerClient' is defined but never used.  no-unused-vars

./app/api/client-error.ts
11:28  Error: 'level' is assigned a value but never used.  no-unused-vars

./app/api/events/route.ts
8:25  Error: 'ReadableStreamController' is not defined.  no-undef

./app/api/middleware.ts
6:26  Error: 'CorsOptions' is defined but never used.  no-unused-vars
66:18  Error: 'cookiesToSet' is defined but never used.  no-unused-vars
97:44  Error: 'adminError' is assigned a value but never used.  no-unused-vars
172:61  Error: 'req' is defined but never used.  no-unused-vars

./app/api/profile/notification/route.ts
39:11  Error: 'supabase' is assigned a value but never used.  no-unused-vars

./app/auth/callback/route.ts
12:11  Error: 'cookieStore' is assigned a value but never used.  no-unused-vars

./app/chat/[id]/chat-client.tsx
15:50  Error: 'createConversation' is assigned a value but never used.  no-unused-vars

./app/chat/[id]/page.tsx
5:1  Error: Import in body of module; reorder to top.  import/first
5:10  Error: 'Chat' is defined but never used.  no-unused-vars
6:1  Error: Import in body of module; reorder to top.  import/first
7:1  Error: Import in body of module; reorder to top.  import/first
7:10  Error: 'useEffect' is defined but never used.  no-unused-vars
7:27  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/node_modules/react/index.js' imported multiple times.  import/no-duplicates
8:1  Error: Import in body of module; reorder to top.  import/first
9:1  Error: Import in body of module; reorder to top.  import/first
9:21  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/node_modules/react/index.js' imported multiple times.  import/no-duplicates

./app/chat/actions.ts
8:3  Error: 'messageId' is defined but never used.  no-unused-vars

./app/chat/layout.tsx
4:25  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/node_modules/next/headers.js' imported multiple times.  import/no-duplicates
5:25  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/node_modules/next/headers.js' imported multiple times.  import/no-duplicates
10:13  Error: 'React' is not defined.  no-undef
18:11  Error: 'headersList' is assigned a value but never used.  no-unused-vars

./app/chat/page.tsx
5:1  Error: Import in body of module; reorder to top.  import/first
6:1  Error: Import in body of module; reorder to top.  import/first
7:1  Error: Import in body of module; reorder to top.  import/first
8:1  Error: Import in body of module; reorder to top.  import/first
9:1  Error: Import in body of module; reorder to top.  import/first
10:1  Error: Import in body of module; reorder to top.  import/first
11:1  Error: Import in body of module; reorder to top.  import/first
19:9  Error: 'setCurrentConversation' is assigned a value but never used.  no-unused-vars
49:15  Error: 'newId' is assigned a value but never used.  no-unused-vars

./app/layout.tsx
44:13  Error: 'React' is not defined.  no-undef

./app/unauthorized/page.tsx
13:20  Error: `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`.  react/no-unescaped-entities

./components/admin/features/users/components/data-table-column-header.tsx
19:11  Error: 'React' is not defined.  no-undef

./components/admin/features/users/components/data-table-faceted-filter.tsx
15:8  Error: Missing file extension for "@/components/ui/command"  import/extensions
20:8  Error: Missing file extension for "@/components/ui/popover"  import/extensions

./components/admin/features/users/components/users-table.tsx
31:3  Error: Definition for rule '@typescript-eslint/no-unused-vars' was not found.  @typescript-eslint/no-unused-vars
32:13  Error: 'ColumnMeta' is defined but never used.  no-unused-vars
32:24  Error: 'TData' is defined but never used.  no-unused-vars
32:47  Error: 'TValue' is defined but never used.  no-unused-vars

./components/admin/features/users/context/users-context.tsx
2:28  Error: Missing file extension for "@/hooks/use-dialog-state"  import/extensions
9:13  Error: 'str' is defined but never used.  no-unused-vars
31:1  Error: Definition for rule 'react-refresh/only-export-components' was not found.  react-refresh/only-export-components

./components/agent-selector.tsx
19:4  Error: 'React' is not defined.  no-undef

./components/app-sidebar.tsx
23:9  Error: 'router' is assigned a value but never used.  no-unused-vars

./components/artifact-actions.tsx
11:25  Error: 'type' is defined but never used.  no-unused-vars

./components/artifact-messages.tsx
15:5  Error: 'messages' is defined but never used.  no-unused-vars
15:29  Error: 'messages' is defined but never used.  no-unused-vars
18:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars

./components/artifact.tsx
76:14  Error: 'input' is defined but never used.  no-unused-vars
85:5  Error: 'message' is defined but never used.  no-unused-vars
86:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
89:5  Error: 'event' is defined but never used.  no-unused-vars
92:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
95:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars

./components/auth/login-form.tsx
20:42  Error: 'React' is not defined.  no-undef

./components/auth-form.tsx
12:16  Error: 'formData' is defined but never used.  no-unused-vars
14:13  Error: 'React' is not defined.  no-undef

./components/chat-header.tsx
3:8  Error: 'Link' is defined but never used.  no-unused-vars
7:10  Error: 'Button' is defined but never used.  no-unused-vars
8:10  Error: 'Tooltip' is defined but never used.  no-unused-vars
8:19  Error: 'TooltipContent' is defined but never used.  no-unused-vars
8:35  Error: 'TooltipTrigger' is defined but never used.  no-unused-vars
15:3  Error: 'chatId' is defined but never used.  no-unused-vars
16:3  Error: 'isReadonly' is defined but never used.  no-unused-vars
21:9  Error: 'router' is assigned a value but never used.  no-unused-vars
23:9  Error: 'isMobile' is assigned a value but never used.  no-unused-vars

./components/code-block.tsx
11:3  Error: 'node' is defined but never used.  no-unused-vars

./components/code-editor.tsx
13:19  Error: 'updatedContent' is defined but never used.  no-unused-vars
13:43  Error: 'debounce' is defined but never used.  no-unused-vars

./components/create-artifact.tsx
9:25  Error: 'type' is defined but never used.  no-unused-vars
21:13  Error: 'context' is defined but never used.  no-unused-vars
22:17  Error: 'context' is defined but never used.  no-unused-vars
32:13  Error: 'context' is defined but never used.  no-unused-vars
43:19  Error: 'updatedContent' is defined but never used.  no-unused-vars
43:43  Error: 'debounce' is defined but never used.  no-unused-vars
45:28  Error: 'index' is defined but never used.  no-unused-vars
62:17  Error: 'parameters' is defined but never used.  no-unused-vars
63:18  Error: 'args' is defined but never used.  no-unused-vars
76:26  Error: 'parameters' is defined but never used.  no-unused-vars
77:27  Error: 'args' is defined but never used.  no-unused-vars

./components/document-preview.tsx
149:14  Error: 'React' is not defined.  no-undef
152:5  Error: 'updaterFn' is defined but never used.  no-unused-vars
152:31  Error: 'currentArtifact' is defined but never used.  no-unused-vars

./components/long-text.tsx
7:8  Error: Missing file extension for "@/components/ui/popover"  import/extensions
16:13  Error: 'React' is not defined.  no-undef

./components/markdown.tsx
11:10  Error: 'node' is defined but never used.  no-unused-vars
18:10  Error: 'node' is defined but never used.  no-unused-vars
25:10  Error: 'node' is defined but never used.  no-unused-vars
32:14  Error: 'node' is defined but never used.  no-unused-vars
39:9  Error: 'node' is defined but never used.  no-unused-vars
52:10  Error: 'node' is defined but never used.  no-unused-vars
59:10  Error: 'node' is defined but never used.  no-unused-vars
66:10  Error: 'node' is defined but never used.  no-unused-vars
73:10  Error: 'node' is defined but never used.  no-unused-vars
80:10  Error: 'node' is defined but never used.  no-unused-vars
87:10  Error: 'node' is defined but never used.  no-unused-vars

./components/message-actions.tsx
31:10  Error: '_' is assigned a value but never used.  no-unused-vars

./components/message-editor.tsx
8:10  Error: 'toast' is defined but never used.  no-unused-vars
14:5  Error: 'messages' is defined but never used.  no-unused-vars
14:29  Error: 'messages' is defined but never used.  no-unused-vars
17:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
45:31  Error: 'React' is not defined.  no-undef

./components/message.tsx
9:40  Error: 'MagnifyingGlassIcon' is defined but never used.  no-unused-vars
38:5  Error: 'messages' is defined but never used.  no-unused-vars
38:29  Error: 'messages' is defined but never used.  no-unused-vars
41:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars

./components/messages.tsx
9:10  Error: 'MagnifyingGlassIcon' is defined but never used.  no-unused-vars
9:37  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/components/icons.tsx' imported multiple times.  import/no-duplicates
10:10  Error: 'cx' is defined but never used.  no-unused-vars
11:10  Error: 'SparklesIcon' is defined but never used.  no-unused-vars
11:30  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/components/icons.tsx' imported multiple times.  import/no-duplicates
19:5  Error: 'messages' is defined but never used.  no-unused-vars
19:29  Error: 'messages' is defined but never used.  no-unused-vars
22:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars

./components/multimodal-input.tsx
51:14  Error: 'value' is defined but never used.  no-unused-vars
59:5  Error: 'message' is defined but never used.  no-unused-vars
60:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
63:5  Error: 'event' is defined but never used.  no-unused-vars
66:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
324:26  Error: 'enabled' is defined but never used.  no-unused-vars

./components/profile-form.tsx
55:28  Error: 'React' is not defined.  no-undef
162:34  Error: 'React' is not defined.  no-undef

./components/profile-setup.tsx
6:8  Error: 'ProfileForm' is defined but never used.  no-unused-vars

./components/sheet-editor.tsx
13:17  Error: 'content' is defined but never used.  no-unused-vars
13:34  Error: 'isCurrentVersion' is defined but never used.  no-unused-vars
25:3  Error: 'status' is defined but never used.  no-unused-vars
26:3  Error: 'isCurrentVersion' is defined but never used.  no-unused-vars

./components/sidebar-history.tsx
59:14  Error: 'chatId' is defined but never used.  no-unused-vars
60:19  Error: 'open' is defined but never used.  no-unused-vars
124:10  Error: 'isDeleting' is assigned a value but never used.  no-unused-vars
194:26  Error: 'React' is not defined.  no-undef

./components/sidebar-toggle.tsx
14:3  Error: 'className' is defined but never used.  no-unused-vars

./components/sidebar-user-nav.tsx
2:39  Error: 'Camera' is defined but never used.  no-unused-vars
19:10  Error: 'UserProfile' is defined but never used.  no-unused-vars

./components/sign-out-form.tsx
3:25  Error: Missing file extension for "@/app/(auth)/auth"  import/extensions

./components/submit-button.tsx
13:13  Error: 'React' is not defined.  no-undef

./components/suggested-actions.tsx
11:5  Error: 'message' is defined but never used.  no-unused-vars
12:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars

./components/text-editor.tsx
28:19  Error: 'updatedContent' is defined but never used.  no-unused-vars
28:43  Error: 'debounce' is defined but never used.  no-unused-vars

./components/toolbar.tsx
32:3  Error: 'CodeIcon' is defined but never used.  no-unused-vars
33:3  Error: 'LogsIcon' is defined but never used.  no-unused-vars
34:3  Error: 'MessageIcon' is defined but never used.  no-unused-vars
35:3  Error: 'PenIcon' is defined but never used.  no-unused-vars
36:3  Error: 'SparklesIcon' is defined but never used.  no-unused-vars
53:5  Error: 'message' is defined but never used.  no-unused-vars
54:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
57:5  Error: 'appendMessage' is defined but never used.  no-unused-vars
147:38  Error: 'x' is defined but never used.  no-unused-vars
157:5  Error: 'message' is defined but never used.  no-unused-vars
158:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
271:5  Error: 'message' is defined but never used.  no-unused-vars
272:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars
331:5  Error: 'message' is defined but never used.  no-unused-vars
332:5  Error: 'chatRequestOptions' is defined but never used.  no-unused-vars

./components/ui/sidebar.tsx
32:13  Error: 'open' is defined but never used.  no-unused-vars
34:19  Error: 'open' is defined but never used.  no-unused-vars
39:7  Error: 'SidebarContext' is already defined.  no-redeclare
55:21  Error: 'open' is defined but never used.  no-unused-vars
78:27  Error: 'value' is defined but never used.  no-unused-vars

./components/ui/skeleton.tsx
6:4  Error: 'React' is not defined.  no-undef

./components/version-footer.tsx
17:25  Error: 'type' is defined but never used.  no-unused-vars

./components/weather.tsx
48:22  Error: This number literal will lose precision at runtime.  no-loss-of-precision

./lib/agents/agent-router.ts
1:30  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/node_modules/ai/dist/index.mjs' imported multiple times.  import/no-duplicates
2:34  Error: 'ToolResults' is defined but never used.  no-unused-vars
2:63  Error: 'AGENT_PROMPTS' is defined but never used.  no-unused-vars
3:15  Error: 'ToolSet' is defined but never used.  no-unused-vars
3:30  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/node_modules/ai/dist/index.mjs' imported multiple times.  import/no-duplicates
4:28  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/lib/logger/edge-logger.ts' imported multiple times.  import/no-duplicates
5:24  Error: '/Users/Humberto/Documents/GitHub/san-diego-version/lib/logger/edge-logger.ts' imported multiple times.  import/no-duplicates

./lib/agents/core/agent-base.ts
3:16  Error: 'uuidv4' is defined but never used.  no-unused-vars
7:3  Error: 'AgentMessage' is defined but never used.  no-unused-vars

./lib/agents/core/agent-tools.ts
23:15  Error: 'params' is defined but never used.  no-unused-vars

./lib/agents/core/agent-types.ts
16:13  Error: 'params' is defined but never used.  no-unused-vars
69:18  Error: 'message' is defined but never used.  no-unused-vars
69:35  Error: 'context' is defined but never used.  no-unused-vars

./lib/agents/tools/perplexity/api.ts
100:68  Error: 'chunk' is defined but never used.  no-unused-vars

./lib/agents/tools/perplexity/cache.ts
33:9  Error: 'normalizedQuery' is assigned a value but never used.  no-unused-vars

./lib/agents/tools/perplexity/index.ts
1:53  Error: Missing file extension for "./deep-search-tool"  import/extensions

./lib/agents/tools/test-web-scraper.ts
2:30  Error: Missing file extension for "../../utils/client-logger"  import/extensions

./lib/agents/tools/vector-search-tool.ts
30:10  Error: 'createTool' is defined but never used.  no-unused-vars
34:13  Error: 'input' is defined but never used.  no-unused-vars

./lib/agents/tools/web-scraper-tool.ts
9:7  Error: 'URL_REGEX' is assigned a value but never used.  no-unused-vars
72:9  Error: 'contentSelectors' is never reassigned. Use 'const' instead.  prefer-const
460:59  Error: Unnecessary escape character: \+.  no-useless-escape
460:114  Error: Unnecessary escape character: \+.  no-useless-escape
460:153  Error: Unnecessary escape character: \+.  no-useless-escape
460:208  Error: Unnecessary escape character: \+.  no-useless-escape

./lib/agents/tools/website-summarizer.ts
1:10  Error: 'myProvider' is defined but never used.  no-unused-vars
107:3  Error: 'processStartTime' is assigned a value but never used.  no-unused-vars

./lib/chat/prompt-builder.ts
2:23  Error: 'enhancePromptWithToolResults' is defined but never used.  no-unused-vars

./lib/chat/response-transformer.ts
1:10  Error: 'createServerClient' is defined but never used.  no-unused-vars
19:18  Error: 'text' is defined but never used.  no-unused-vars

./lib/chat/stream-processor.ts
12:16  Error: 'text' is defined but never used.  no-unused-vars

./lib/chat/tools.ts
8:10  Error: 'callPerplexityAPI' is defined but never used.  no-unused-vars
12:11  Error: 'ScrapedContent' is defined but never used.  no-unused-vars
38:28  Error: 'metrics' is assigned a value but never used.  no-unused-vars
367:36  Error: Unnecessary escape character: \..  no-useless-escape
367:59  Error: Unnecessary escape character: \..  no-useless-escape
367:76  Error: Unnecessary escape character: \..  no-useless-escape
367:94  Error: Unnecessary escape character: \..  no-useless-escape

./lib/chat/url-utils.ts
3:60  Error: Unnecessary escape character: \+.  no-useless-escape
3:115  Error: Unnecessary escape character: \+.  no-useless-escape
3:154  Error: Unnecessary escape character: \+.  no-useless-escape
3:209  Error: Unnecessary escape character: \+.  no-useless-escape

./lib/db/queries.ts
9:52  Error: 'documentId' is defined but never used.  no-unused-vars

./lib/editor/config.ts
31:19  Error: 'updatedContent' is defined but never used.  no-unused-vars
31:43  Error: 'debounce' is defined but never used.  no-unused-vars

./lib/editor/diff.js
305:44  Error: 'node1' is defined but never used.  no-unused-vars
305:51  Error: 'node2' is defined but never used.  no-unused-vars
346:25  Error: 'Set' is not defined.  no-undef

./lib/editor/react-renderer.tsx
4:28  Error: 'React' is not defined.  no-undef

./lib/logger/api-logger.ts
3:24  Error: Missing file extension for "./logger"  import/extensions
5:29  Error: 'req' is defined but never used.  no-unused-vars
5:50  Error: 'res' is defined but never used.  no-unused-vars

./lib/logger/vector-logger.ts
82:65  Error: 'index' is defined but never used.  no-unused-vars

./lib/logger.ts
4:6  Error: 'LogLevel' is defined but never used.  no-unused-vars
8:11  Error: 'message' is defined but never used.  no-unused-vars
8:28  Error: 'data' is defined but never used.  no-unused-vars
9:10  Error: 'message' is defined but never used.  no-unused-vars
9:27  Error: 'data' is defined but never used.  no-unused-vars
10:10  Error: 'message' is defined but never used.  no-unused-vars
10:27  Error: 'data' is defined but never used.  no-unused-vars
11:11  Error: 'message' is defined but never used.  no-unused-vars
11:28  Error: 'error' is defined but never used.  no-unused-vars
12:11  Error: 'context' is defined but never used.  no-unused-vars

./lib/middleware/rate-limit.ts
35:14  Error: 'path' is assigned a value but never used.  no-unused-vars
60:19  Error: 'req' is defined but never used.  no-unused-vars

./lib/supabase/server.ts
90:9  Error: 'validSupabaseUrl' is never reassigned. Use 'const' instead.  prefer-const

./lib/vector/documentRetrieval.ts
167:108  Error: 'isSlowQuery' is defined but never used.  no-unused-vars

./lib/vector/embeddings.ts
78:3  Error: 'similarityThreshold' is assigned a value but never used.  no-unused-vars
135:16  Error: 'simulateEmbedding' is defined but never used.  no-unused-vars
