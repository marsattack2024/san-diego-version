├── CLAUDE.md
├── DEPLOYMENT.md
├── README.md
├── app
│   ├── (auth)
│   │   ├── layout.tsx
│   │   ├── login
│   │   └── supabase-auth
│   ├── admin
│   │   ├── error.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── users
│   ├── api
│   │   ├── admin
│   │   ├── auth
│   │   ├── chat
│   │   ├── client-error.ts
│   │   ├── client-logs
│   │   ├── debug
│   │   ├── document
│   │   ├── events
│   │   ├── example
│   │   ├── example.ts
│   │   ├── history
│   │   ├── middleware.ts
│   │   ├── perplexity
│   │   ├── profile
│   │   └── vote
│   ├── auth
│   │   └── callback
│   ├── chat
│   │   ├── [id]
│   │   ├── actions.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   ├── profile
│   │   └── page.tsx
│   └── unauthorized
│       └── page.tsx
├── components
│   ├── admin
│   │   └── features
│   ├── agent-selector.tsx
│   ├── app-sidebar.tsx
│   ├── auth
│   │   ├── auth-button.tsx
│   │   ├── index.ts
│   │   └── login-form.tsx
│   ├── auth-form.tsx
│   ├── auth-headers-setup.tsx
│   ├── chat-header.tsx
│   ├── chat.tsx
│   ├── code-block.tsx
│   ├── code-editor.tsx
│   ├── console.tsx
│   ├── deep-search-tracker.tsx
│   ├── diffview.tsx
│   ├── icons.tsx
│   ├── image-editor.tsx
│   ├── long-text.tsx
│   ├── markdown.tsx
│   ├── message-actions.tsx
│   ├── message-editor.tsx
│   ├── message-reasoning.tsx
│   ├── message.tsx
│   ├── messages.tsx
│   ├── multimodal-input.tsx
│   ├── overview.tsx
│   ├── preview-attachment.tsx
│   ├── profile-form.tsx
│   ├── profile-setup.tsx
│   ├── rag-result-count.tsx
│   ├── sheet-editor.tsx
│   ├── sidebar-history.tsx
│   ├── sidebar-toggle.tsx
│   ├── sidebar-user-nav.tsx
│   ├── sign-out-form.tsx
│   ├── submit-button.tsx
│   ├── suggested-actions.tsx
│   ├── text-editor.tsx
│   ├── theme-provider.tsx
│   ├── toast.tsx
│   ├── ui
│   │   ├── alert-dialog.tsx
│   │   ├── alert.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── sidebar.tsx
│   │   ├── skeleton.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   └── tooltip.tsx
│   ├── use-scroll-to-bottom.ts
│   └── weather.tsx
├── components.json
├── config
│   ├── agents.ts
│   └── site.ts
├── docs
│   ├── AI SDK Nextjs Routes.md
│   ├── AI SDK Overview.md
│   ├── AI SDK Prompts.md
│   ├── AI SDK RAG Chatbot.md
│   ├── AI SDK Streaming.md
│   ├── AI SDK Tools.md
│   ├── admin-authentication-fix.md
│   ├── admin-dash.md
│   ├── admin-dashboard-responsive.md
│   ├── agent-selector.md
│   ├── agents.md
│   ├── ai-tool-calling.md
│   ├── app backend structure.md
│   ├── app flow doc.md
│   ├── app frontend guidelines.md
│   ├── app project requirements.md
│   ├── app tree readme.md
│   ├── auth-optimization.md
│   ├── deepsearch.perplexity.md
│   ├── fix-histories-plan.md
│   ├── logging.md
│   ├── perplexity-api-documentation.md
│   ├── profile-setup-flow.md
│   ├── puppeteer-web-scraper.md
│   ├── redis-caching.md
│   ├── rls-policy-fix.md
│   ├── security-plan.md
│   ├── supabase rag with permissions.md
│   ├── supabase-chat-history.md
│   ├── supabase-compatibility.md
│   ├── supabase-email-login.md
│   ├── supabase-user-profiles.md
│   ├── user-creation-flow.md
│   └── user-deletion-guide.md
├── hooks
│   └── use-mobile.tsx
├── lib
│   ├── actions
│   │   ├── resources.ts
│   │   └── resources.types.ts
│   ├── admin
│   │   └── api-client.ts
│   ├── agents
│   │   ├── agent-router.ts
│   │   ├── core
│   │   ├── index.ts
│   │   ├── prompts
│   │   ├── specialized
│   │   └── tools
│   ├── ai
│   │   ├── agents.ts
│   │   ├── models.ts
│   │   └── providers.ts
│   ├── api
│   │   ├── events-manager.ts
│   │   └── history-service.ts
│   ├── auth
│   │   └── auth-cache.ts
│   ├── cache
│   │   ├── ai-middleware.ts
│   │   ├── client-cache.ts
│   │   └── redis-client.ts
│   ├── chat
│   │   ├── prompt-builder.ts
│   │   ├── response-transformer.ts
│   │   ├── response-validator.ts
│   │   ├── stream-processor.ts
│   │   ├── tool-manager.ts
│   │   ├── tools.ts
│   │   ├── url-utils.ts
│   │   └── validator.ts
│   ├── db
│   │   ├── index.ts
│   │   ├── queries.ts
│   │   └── schema.ts
│   ├── editor
│   │   ├── config.ts
│   │   ├── diff.js
│   │   ├── functions.tsx
│   │   └── react-renderer.tsx
│   ├── env-validator.ts
│   ├── logger
│   │   ├── client-logger.ts
│   │   ├── constants.ts
│   │   ├── context.ts
│   │   ├── edge-logger.ts
│   │   └── index.ts
│   ├── logger.ts
│   ├── middleware
│   │   ├── cors.ts
│   │   ├── rate-limit.ts
│   │   └── url-scraping-middleware.ts
│   ├── supabase
│   │   ├── auth-provider.tsx
│   │   ├── auth-utils.ts
│   │   ├── client.ts
│   │   └── server.ts
│   ├── utils.ts
│   ├── validation
│   │   └── index.ts
│   └── vector
│       ├── documentRetrieval.ts
│       ├── embeddings.ts
│       ├── formatters.ts
│       ├── init.ts
│       ├── rag-cache.ts
│       └── types.ts
├── middleware.ts
├── next-env.d.ts
├── next.config.mjs
├── package-lock.json
├── package.json
├── pages
│   └── _document.tsx
├── postcss.config.mjs
├── public
│   ├── favicon.ico
│   ├── favicon.svg
│   └── fonts
│       ├── geist-mono.woff2
│       └── geist.woff2
├── scripts
│   ├── README.md
│   ├── check-env.ts
│   ├── cleanup-unused-assets.mjs
│   ├── deploy-vercel.js
│   ├── dev.js
│   ├── lib
│   │   ├── env-loader.ts
│   │   └── test-utils.ts
│   ├── load-env.ts
│   ├── run-tests.ts
│   ├── setup
│   │   └── setup-first-admin.js
│   ├── setup-env.ts
│   ├── setup-supabase.js
│   ├── test-admin-status.ts
│   ├── test-agent-router.mjs
│   ├── test-chat-tools.ts
│   ├── test-document-search.ts
│   ├── test-embeddings.ts
│   ├── tests
│   │   ├── document-search.test.ts
│   │   ├── embeddings.test.ts
│   │   ├── env-test.ts
│   │   ├── logging.test.ts
│   │   ├── perplexity-direct-test.ts
│   │   ├── perplexity.test.ts
│   │   ├── scraper.test.ts
│   │   └── supabase-rpc-test.ts
│   └── update-imports.js
├── stores
│   ├── auth-store.ts
│   └── chat-store.ts
├── supabase
│   └── migrations
│       ├── 20240622_save_message_function.sql
│       ├── 20240701_update_admin_check.sql
│       ├── 20240702_add_raw_profile_query.sql
│       ├── 20240703_improve_admin_checks.sql
│       ├── 20240704_create_audit_logs.sql
│       ├── 20240705_fix_user_deletion_complete.sql
│       ├── 20240705_proper_user_cascade_delete.sql
│       ├── 20250321_profile_metadata_optimization.sql
│       ├── add_admin_role.sql
│       ├── add_admin_role_improved.sql
│       ├── add_full_name.sql
│       ├── advanced_performance.sql
│       ├── cascade_behaviors.sql
│       ├── create_user_profiles_table.sql
│       ├── documents.sql
│       ├── ensure_cascade_deletes.sql
│       ├── minimal_schema.sql
│       ├── profile_optimization.sql
│       ├── schema_improvements.sql
│       ├── simple_fix.sql
│       └── user_profiles.sql
├── tailwind.config.ts
├── tsconfig.json
├── types
│   ├── core
│   │   ├── agent.ts
│   │   ├── auth.ts
│   │   ├── chat.ts
│   │   ├── index.ts
│   │   └── message-identity.ts
│   ├── hooks
│   ├── index.ts
│   ├── lib
│   │   ├── index.ts
│   │   └── lodash.d.ts
│   └── vector
└── vercel.json