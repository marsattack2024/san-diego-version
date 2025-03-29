"use strict"; (() => {
    (function () {
        // Avoid loading the widget multiple times
        if (window.marlanChatWidgetLoaded) {
            console.warn("Marlan Chat Widget already loaded. Skipping initialization.");
            return;
        }

        window.marlanChatWidgetLoaded = true;

        // Default configuration
        let config = {
            position: "bottom-right",
            title: "Ask Marlan",
            primaryColor: "#0070f3",
            greeting: "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?",
            placeholder: "Type your message...",
            apiEndpoint: "https://marlan.photographytoprofits.com/api/widget-chat",
            width: "360px",
            height: "500px",
            zIndex: 9999
        };

        // Widget DOM elements
        let elements = {
            container: null,
            bubble: null,
            header: null,
            messagesContainer: null,
            inputContainer: null,
            input: null,
            sendButton: null,
            resetButton: null
        };

        // Chat session state
        let state = {
            messages: [],
            sessionId: null,
            isOpen: false,
            isStreaming: false,
            abortController: null
        };

        // Add styles to the document
        function injectStyles() {
            const style = document.createElement("style");
            style.id = "marlan-chat-widget-styles";
            style.innerHTML = `
      .marlan-chat-widget-container {
        position: fixed;
        z-index: ${config.zIndex};
        max-height: ${config.height};
        width: ${config.width};
        display: flex;
        flex-direction: column;
        background-color: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        transition: all 0.3s ease;
        opacity: 0;
        transform: translateY(20px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .marlan-chat-widget-container.open {
        opacity: 1;
        transform: translateY(0);
      }

      .marlan-chat-widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background-color: ${config.primaryColor};
        color: #ffffff;
      }

      .marlan-chat-widget-title {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .marlan-chat-widget-close {
        background: none;
        border: none;
        color: #ffffff;
        cursor: pointer;
        font-size: 18px;
      }

      .marlan-chat-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .marlan-chat-widget-input-container {
        padding: 12px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
      }
      
      .marlan-chat-widget-input-row {
        display: flex;
        align-items: flex-end;
      }

      .marlan-chat-widget-input {
        flex: 1;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 14px;
        outline: none;
        resize: none;
        min-height: 60px;
        max-height: 120px;
      }

      .marlan-chat-widget-send {
        background-color: ${config.primaryColor};
        border: none;
        border-radius: 8px;
        color: #ffffff;
        cursor: pointer;
        padding: 8px 12px;
        margin-left: 8px;
        height: 60px;
        width: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .marlan-chat-widget-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .marlan-chat-widget-reset-container {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
      }

      .marlan-chat-widget-reset {
        background: none;
        border: none;
        color: #6B7280;
        font-size: 12px;
        cursor: pointer;
        padding: 0;
      }

      .marlan-chat-widget-reset:hover {
        color: #374151;
      }

      .marlan-chat-widget-bubble {
        position: fixed;
        z-index: ${config.zIndex};
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${config.primaryColor};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
      }

      .marlan-chat-widget-bubble:hover {
        transform: scale(1.05);
      }

      .marlan-chat-widget-message {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      .marlan-chat-widget-message.user {
        align-self: flex-end;
        background-color: rgba(0, 112, 243, 0.1);
        color: #111827;
        border-bottom-right-radius: 4px;
      }

      .marlan-chat-widget-message.assistant {
        align-self: flex-start;
        background-color: #f3f4f6;
        color: #111827;
        border-bottom-left-radius: 4px;
      }
      
      .marlan-chat-widget-typing {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        margin-right: auto;
        background-color: #f3f4f6;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
      }
      
      .marlan-chat-widget-typing-dot {
        width: 8px;
        height: 8px;
        margin: 0 2px;
        background-color: #9CA3AF;
        border-radius: 50%;
        animation: typing-dot 1.4s infinite ease-in-out both;
      }
      
      .marlan-chat-widget-typing-dot:nth-child(1) {
        animation-delay: -0.32s;
      }
      
      .marlan-chat-widget-typing-dot:nth-child(2) {
        animation-delay: -0.16s;
      }
      
      @keyframes typing-dot {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }
      
      .text-center {
        text-align: center;
      }
      
      .py-6 {
        padding-top: 1.5rem;
        padding-bottom: 1.5rem;
      }
      
      .text-gray-500 {
        color: #6b7280;
      }

      .marlan-chat-widget-error {
        padding: 8px 12px;
        margin: 8px 0;
        background-color: #FEF2F2;
        border-radius: 8px;
        color: #B91C1C;
        font-size: 12px;
        display: flex;
        align-items: center;
      }

      /* Position variations */
      .marlan-chat-widget-container.bottom-right, .marlan-chat-widget-bubble.bottom-right {
        bottom: 20px;
        right: 20px;
      }

      .marlan-chat-widget-container.bottom-left, .marlan-chat-widget-bubble.bottom-left {
        bottom: 20px;
        left: 20px;
      }

      .marlan-chat-widget-container.top-right, .marlan-chat-widget-bubble.top-right {
        top: 20px;
        right: 20px;
      }

      .marlan-chat-widget-container.top-left, .marlan-chat-widget-bubble.top-left {
        top: 20px;
        left: 20px;
      }
      `;
            document.head.appendChild(style);
        }

        // Create DOM elements for the widget
        function createWidgetElements() {
            // Create container
            elements.container = document.createElement("div");
            elements.container.className = `marlan-chat-widget-container ${config.position}`;
            elements.container.style.display = "none";

            // Create header
            elements.header = document.createElement("div");
            elements.header.className = "marlan-chat-widget-header";

            const title = document.createElement("h2");
            title.className = "marlan-chat-widget-title";
            title.textContent = config.title;

            const closeButton = document.createElement("button");
            closeButton.className = "marlan-chat-widget-close";
            closeButton.innerHTML = "&#x2715;";
            closeButton.addEventListener("click", toggleWidget);

            elements.header.appendChild(title);
            elements.header.appendChild(closeButton);

            // Create messages container
            elements.messagesContainer = document.createElement("div");
            elements.messagesContainer.className = "marlan-chat-widget-messages";

            // Create input container
            elements.inputContainer = document.createElement("div");
            elements.inputContainer.className = "marlan-chat-widget-input-container";

            const inputRow = document.createElement("div");
            inputRow.className = "marlan-chat-widget-input-row";

            elements.input = document.createElement("textarea");
            elements.input.className = "marlan-chat-widget-input";
            elements.input.placeholder = config.placeholder;
            elements.input.rows = 1;
            elements.input.addEventListener("keydown", function (e) {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }

                // Auto-resize textarea
                setTimeout(() => {
                    elements.input.style.height = "auto";
                    elements.input.style.height = Math.min(elements.input.scrollHeight, 120) + "px";
                }, 0);
            });

            elements.sendButton = document.createElement("button");
            elements.sendButton.className = "marlan-chat-widget-send";
            elements.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
            elements.sendButton.addEventListener("click", sendMessage);

            inputRow.appendChild(elements.input);
            inputRow.appendChild(elements.sendButton);

            const resetContainer = document.createElement("div");
            resetContainer.className = "marlan-chat-widget-reset-container";

            elements.resetButton = document.createElement("button");
            elements.resetButton.className = "marlan-chat-widget-reset";
            elements.resetButton.textContent = "Reset conversation";
            elements.resetButton.addEventListener("click", resetConversation);

            resetContainer.appendChild(elements.resetButton);

            elements.inputContainer.appendChild(inputRow);
            elements.inputContainer.appendChild(resetContainer);

            // Create bubble button
            elements.bubble = document.createElement("div");
            elements.bubble.className = `marlan-chat-widget-bubble ${config.position}`;
            elements.bubble.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
            elements.bubble.addEventListener("click", toggleWidget);

            // Assemble the widget
            elements.container.appendChild(elements.header);
            elements.container.appendChild(elements.messagesContainer);
            elements.container.appendChild(elements.inputContainer);

            // Add to document
            document.body.appendChild(elements.container);
            document.body.appendChild(elements.bubble);
        }

        // Add a message to the chat
        function addMessage(content, role = "assistant") {
            const message = document.createElement("div");
            message.className = `marlan-chat-widget-message ${role}`;
            message.innerHTML = content.replace(/\n/g, "<br>");
            elements.messagesContainer.appendChild(message);
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;

            // Save message to state
            state.messages.push({ role, content });
        }

        // Show typing indicator
        function showTypingIndicator() {
            const typing = document.createElement("div");
            typing.id = "marlan-chat-widget-typing";
            typing.className = "marlan-chat-widget-typing";

            for (let i = 0; i < 3; i++) {
                const dot = document.createElement("div");
                dot.className = "marlan-chat-widget-typing-dot";
                typing.appendChild(dot);
            }

            elements.messagesContainer.appendChild(typing);
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }

        // Remove typing indicator
        function removeTypingIndicator() {
            const typing = document.getElementById("marlan-chat-widget-typing");
            if (typing) typing.remove();
        }

        // Toggle widget visibility
        function toggleWidget() {
            if (elements.container.style.display !== "none") {
                elements.container.classList.remove("open");
                setTimeout(() => {
                    elements.container.style.display = "none";
                }, 300);
            } else {
                elements.container.style.display = "flex";
                setTimeout(() => {
                    elements.container.classList.add("open");
                    elements.input.focus();
                }, 10);
            }

            state.isOpen = elements.container.style.display !== "none";
        }

        // Generate or retrieve session ID
        function getSessionId() {
            if (state.sessionId) return state.sessionId;

            let sessionId = localStorage.getItem("marlan-chat-session-id");
            if (!sessionId) {
                sessionId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                    const r = Math.random() * 16 | 0;
                    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
                });
                localStorage.setItem("marlan-chat-session-id", sessionId);
            }

            state.sessionId = sessionId;
            return sessionId;
        }

        // Add welcome message
        function addWelcomeMessage() {
            if (config.greeting) {
                const welcomeMessage = document.createElement("div");
                welcomeMessage.className = "text-center py-6 text-gray-500";
                welcomeMessage.textContent = config.greeting;
                elements.messagesContainer.appendChild(welcomeMessage);
            }
        }

        // Reset conversation
        function resetConversation() {
            // Clear messages in UI
            elements.messagesContainer.innerHTML = "";

            // Add welcome message
            addWelcomeMessage();

            // Clear messages in state
            state.messages = [];

            // Generate new session ID
            localStorage.removeItem("marlan-chat-session-id");
            state.sessionId = null;
            getSessionId();
        }

        // Send a message to the API
        async function sendMessage() {
            const message = elements.input.value.trim();
            if (!message || state.isStreaming) return;

            // Add user message to UI
            addMessage(message, "user");

            // Clear input
            elements.input.value = "";
            elements.input.style.height = "auto";

            // Show typing indicator
            showTypingIndicator();

            // Set streaming state
            state.isStreaming = true;
            elements.sendButton.disabled = true;

            // Get session ID
            const sessionId = getSessionId();

            // Cancel any ongoing requests
            if (state.abortController) {
                state.abortController.abort();
            }

            // Create new abort controller
            state.abortController = new AbortController();

            try {
                // Make API request
                const response = await fetch(config.apiEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message,
                        sessionId
                    }),
                    signal: state.abortController.signal
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                // Remove typing indicator
                removeTypingIndicator();

                // Get response as text stream
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let assistantMessage = "";

                // Create message container
                const messageEl = document.createElement("div");
                messageEl.className = "marlan-chat-widget-message assistant";
                elements.messagesContainer.appendChild(messageEl);

                // Process stream
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        break;
                    }

                    // Decode chunk
                    const chunk = decoder.decode(value, { stream: true });
                    assistantMessage += chunk;

                    // Update UI
                    messageEl.innerHTML = assistantMessage.replace(/\n/g, "<br>");
                    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
                }

                // Save assistant message to state
                state.messages.push({ role: "assistant", content: assistantMessage });

            } catch (error) {
                // Handle errors
                console.error("Error sending message:", error);

                // Remove typing indicator
                removeTypingIndicator();

                // Show error in UI
                if (error.name !== "AbortError") {
                    const errorEl = document.createElement("div");
                    errorEl.className = "marlan-chat-widget-error";
                    errorEl.textContent = "Sorry, something went wrong. Please try again.";
                    elements.messagesContainer.appendChild(errorEl);
                    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
                }
            } finally {
                // Reset state
                state.isStreaming = false;
                elements.sendButton.disabled = false;
                state.abortController = null;
            }
        }

        // Initialize the widget
        function init(customConfig = {}) {
            // Merge custom config with defaults
            config = { ...config, ...customConfig };

            // Inject styles
            injectStyles();

            // Create DOM elements
            createWidgetElements();

            // Add welcome message
            addWelcomeMessage();

            // Get session ID
            getSessionId();

            console.log("Marlan Chat Widget initialized");
        }

        // Expose API
        window.MarlanChatWidget = {
            init,
            toggle: toggleWidget,
            reset: resetConversation
        };

        // Auto-initialize if query arguments are passed
        const existingObj = window.marlanChat;
        if (existingObj && Array.isArray(existingObj.q)) {
            existingObj.q.forEach(args => {
                if (args[0] === "init") {
                    init(args[1] || {});
                }
            });
        }
    })();
})(); 