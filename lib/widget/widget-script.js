/**
 * Marlin Chat Widget - Embeddable Script
 * This script is designed to be embedded via Google Tag Manager
 * Version: 0.1.0
 */

// Use IIFE to avoid polluting global namespace
(function() {
  // Check if the widget is already loaded
  if (window.marlinChatWidgetLoaded) {
    console.warn('Marlin Chat Widget already loaded. Skipping initialization.');
    return;
  }

  // Set flag to prevent multiple initializations
  window.marlinChatWidgetLoaded = true;

  /**
   * Widget configuration defaults
   */
  const DEFAULT_CONFIG = {
    position: 'bottom-right',
    title: 'Ask Marlin',
    primaryColor: '#0070f3',
    bubbleIcon: null, // Optional custom icon URL
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat',
    width: '350px',
    height: '500px',
    zIndex: 9999
  };

  /**
   * Create and inject widget styles
   */
  function injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.id = 'marlin-chat-widget-styles';
    styleEl.innerHTML = `
      .marlin-chat-widget-container {
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
      }

      .marlin-chat-widget-container.open {
        opacity: 1;
        transform: translateY(0);
      }

      .marlin-chat-widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background-color: ${config.primaryColor};
        color: #ffffff;
      }

      .marlin-chat-widget-title {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .marlin-chat-widget-close {
        background: none;
        border: none;
        color: #ffffff;
        cursor: pointer;
        font-size: 18px;
      }

      .marlin-chat-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .marlin-chat-widget-input-container {
        padding: 12px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
      }

      .marlin-chat-widget-input {
        flex: 1;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 14px;
        outline: none;
      }

      .marlin-chat-widget-send {
        background-color: ${config.primaryColor};
        border: none;
        border-radius: 8px;
        color: #ffffff;
        cursor: pointer;
        padding: 8px 12px;
        margin-left: 8px;
      }

      .marlin-chat-widget-bubble {
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

      .marlin-chat-widget-bubble:hover {
        transform: scale(1.05);
      }

      .marlin-chat-widget-message {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      .marlin-chat-widget-message br {
        display: block;
        margin-bottom: 5px;
        content: "";
      }

      .marlin-chat-widget-message ul, 
      .marlin-chat-widget-message ol {
        padding-left: 20px;
        margin: 8px 0;
      }

      .marlin-chat-widget-message li {
        margin-bottom: 4px;
      }

      .marlin-chat-widget-message.user {
        align-self: flex-end;
        background-color: ${config.primaryColor};
        color: #ffffff;
        border-bottom-right-radius: 4px;
      }

      .marlin-chat-widget-message.assistant {
        align-self: flex-start;
        background-color: #f3f4f6;
        color: #111827;
        border-bottom-left-radius: 4px;
      }

      /* Position variations */
      .marlin-chat-widget-container.bottom-right, .marlin-chat-widget-bubble.bottom-right {
        bottom: 20px;
        right: 20px;
      }

      .marlin-chat-widget-container.bottom-left, .marlin-chat-widget-bubble.bottom-left {
        bottom: 20px;
        left: 20px;
      }

      .marlin-chat-widget-container.top-right, .marlin-chat-widget-bubble.top-right {
        top: 20px;
        right: 20px;
      }

      .marlin-chat-widget-container.top-left, .marlin-chat-widget-bubble.top-left {
        top: 20px;
        left: 20px;
      }

      /* Loading indicator */
      .marlin-chat-widget-typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        background-color: #f3f4f6;
        max-width: fit-content;
        align-self: flex-start;
      }

      .marlin-chat-widget-typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #6b7280;
        animation: typingAnimation 1s infinite ease-in-out;
      }

      .marlin-chat-widget-typing-dot:nth-child(1) {
        animation-delay: 0s;
      }

      .marlin-chat-widget-typing-dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .marlin-chat-widget-typing-dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes typingAnimation {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-4px);
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  /**
   * Create widget DOM elements
   */
  function createWidgetElements() {
    // Chat bubble
    const bubble = document.createElement('div');
    bubble.className = `marlin-chat-widget-bubble ${config.position}`;
    bubble.innerHTML = config.bubbleIcon ? 
      `<img src="${config.bubbleIcon}" alt="Chat" width="30" height="30">` : 
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="#ffffff"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    document.body.appendChild(bubble);

    // Chat container
    const container = document.createElement('div');
    container.className = `marlin-chat-widget-container ${config.position}`;
    container.style.display = 'none';
    
    // Header
    const header = document.createElement('div');
    header.className = 'marlin-chat-widget-header';
    header.innerHTML = `
      <h3 class="marlin-chat-widget-title">${config.title}</h3>
      <button class="marlin-chat-widget-close">&times;</button>
    `;
    
    // Messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'marlin-chat-widget-messages';
    
    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'marlin-chat-widget-input-container';
    inputContainer.innerHTML = `
      <input type="text" class="marlin-chat-widget-input" placeholder="Type your message...">
      <button class="marlin-chat-widget-send">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    `;
    
    // Assemble the widget
    container.appendChild(header);
    container.appendChild(messagesContainer);
    container.appendChild(inputContainer);
    document.body.appendChild(container);
    
    return {
      bubble,
      container,
      messagesContainer,
      closeButton: header.querySelector('.marlin-chat-widget-close'),
      input: inputContainer.querySelector('.marlin-chat-widget-input'),
      sendButton: inputContainer.querySelector('.marlin-chat-widget-send')
    };
  }

  /**
   * Add a message to the chat
   */
  function addMessage(text, role = 'assistant') {
    const message = document.createElement('div');
    message.className = `marlin-chat-widget-message ${role}`;
    
    // Replace line breaks with <br> tags and preserve formatting
    message.innerHTML = text.replace(/\n/g, '<br>');
    
    elements.messagesContainer.appendChild(message);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }

  /**
   * Show typing indicator
   */
  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'marlin-chat-widget-typing';
    typing.innerHTML = `
      <div class="marlin-chat-widget-typing-dot"></div>
      <div class="marlin-chat-widget-typing-dot"></div>
      <div class="marlin-chat-widget-typing-dot"></div>
    `;
    typing.id = 'marlin-chat-widget-typing';
    elements.messagesContainer.appendChild(typing);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }

  /**
   * Hide typing indicator
   */
  function hideTyping() {
    const typing = document.getElementById('marlin-chat-widget-typing');
    if (typing) {
      typing.remove();
    }
  }

  /**
   * Toggle chat widget visibility
   */
  function toggleWidget() {
    const isVisible = elements.container.style.display !== 'none';
    
    if (isVisible) {
      elements.container.classList.remove('open');
      setTimeout(() => {
        elements.container.style.display = 'none';
      }, 300);
    } else {
      elements.container.style.display = 'flex';
      setTimeout(() => {
        elements.container.classList.add('open');
        // Focus input field
        elements.input.focus();
      }, 10);
    }
  }

  /**
   * Get or create a session ID for the user
   */
  function getSessionId() {
    let sessionId = localStorage.getItem('marlin-chat-session-id');
    
    if (!sessionId) {
      sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('marlin-chat-session-id', sessionId);
    }
    
    return sessionId;
  }

  /**
   * Send message to API
   */
  async function sendMessage(text) {
    if (!text.trim()) return;
    
    // Add user message to chat
    addMessage(text, 'user');
    
    // Clear input
    elements.input.value = '';
    
    // Show typing indicator
    showTyping();
    
    try {
      const sessionId = getSessionId();
      
      // Enhanced logging for debugging
      console.log('Widget sending message to API:', {
        message: text,
        messageLength: text.length,
        messageType: typeof text,
        sessionId: sessionId,
        endpoint: config.apiEndpoint
      });
      
      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          sessionId
        })
      });
      
      // Log response headers for debugging
      console.log('Response status:', response.status);
      console.log('Response content-type:', response.headers.get('content-type'));
      if (!response.ok) {
        // Try to get more detailed error info
        const responseText = await response.text();
        console.error('API error response:', responseText);
        try {
          const errorData = JSON.parse(responseText);
          console.error('API error parsed:', errorData);
          hideTyping();
          
          // Use the error message from the response if available
          const errorMessage = errorData.message || errorData.error || `Error: ${response.status} ${response.statusText}`;
          addMessage(`Sorry, there was a problem: ${errorMessage}. Please try again later.`, 'assistant');
        } catch (parseError) {
          // If we can't parse the error JSON, show a generic message
          console.error('Failed to parse error response:', parseError);
          hideTyping();
          addMessage(`Sorry, there was an error (${response.status}). Please try again later.`, 'assistant');
        }
        return;
      }
      
      // Handle text streaming - simpler now with toTextStreamResponse()
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      hideTyping();
      const message = document.createElement('div');
      message.className = 'marlin-chat-widget-message assistant';
      elements.messagesContainer.appendChild(message);
      
      let responseText = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream complete');
            break;
          }
          
          // Text streaming is clean now, no need to filter protocol markers
          const chunk = decoder.decode(value, { stream: true });
          console.log('Received chunk:', JSON.stringify(chunk));
          
          if (chunk.trim()) {
            responseText += chunk;
            // Use innerHTML instead of textContent to preserve line breaks
            message.innerHTML = responseText.replace(/\n/g, '<br>');
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
          }
        }
        
        // Final decode to ensure we get the last chunk
        const finalChunk = decoder.decode();
        if (finalChunk.trim()) {
          console.log('Final chunk:', JSON.stringify(finalChunk));
          responseText += finalChunk;
          // Use innerHTML instead of textContent to preserve line breaks
          message.innerHTML = responseText.replace(/\n/g, '<br>');
        }
        
        // If empty response, show fallback message
        if (!responseText.trim()) {
          console.warn('Empty response received from streaming API');
          message.innerHTML = "I'm sorry, I couldn't find specific information about that in my knowledge base. Please try asking in a different way or about another topic.";
        }
        
        console.log('Final response text:', responseText);
      } catch (streamError) {
        console.error('Error processing stream:', streamError);
        message.innerHTML = "Sorry, there was an error processing the response stream. Please try again.";
      }
    } catch (error) {
      console.error('Error sending message:', error);
      hideTyping();
      addMessage('Sorry, there was an error connecting to the server. Please check your connection and try again later.', 'assistant');
    }
  }

  /**
   * Initialize event listeners
   */
  function initEventListeners() {
    // Toggle chat on bubble click
    elements.bubble.addEventListener('click', toggleWidget);
    
    // Close chat on close button click
    elements.closeButton.addEventListener('click', toggleWidget);
    
    // Send message on button click
    elements.sendButton.addEventListener('click', () => {
      sendMessage(elements.input.value);
    });
    
    // Send message on Enter key
    elements.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage(elements.input.value);
      }
    });
  }

  /**
   * Initialize the widget
   */
  function init(userConfig = {}) {
    // Merge default config with user config
    config = { ...DEFAULT_CONFIG, ...userConfig };
    
    // Create styles and DOM elements
    injectStyles();
    elements = createWidgetElements();
    
    // Add welcome message
    addMessage('Hi there! How can I help you today?');
    
    // Initialize event listeners
    initEventListeners();
    
    // Log initialization
    console.log('Marlin Chat Widget initialized successfully');
  }

  // Expose initialization function to global scope
  window.initChatWidget = init;
  
  // Variables for closures
  let config;
  let elements;

  // Auto-initialize if configuration exists
  if (window.marlinChatConfig) {
    init(window.marlinChatConfig);
  }
})(); 