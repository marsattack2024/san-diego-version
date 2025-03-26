import { NextRequest } from 'next/server';

// Get allowed origins from environment or use default
const getAllowedOrigins = () => {
  const originsFromEnv = process.env.WIDGET_ALLOWED_ORIGINS;
  return originsFromEnv 
    ? originsFromEnv.split(',') 
    : ['https://marlan.photographytoprofits.com', 'https://programs.thehighrollersclub.io', 'http://localhost:3000', '*'];
};

// Function to add CORS headers to a response
function addCorsHeaders(response: Response, req: NextRequest): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');
  
  const corsHeaders = new Headers(response.headers);
  
  if (isAllowedOrigin) {
    corsHeaders.set('Access-Control-Allow-Origin', origin);
  } else {
    corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  
  corsHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
  corsHeaders.set('Access-Control-Max-Age', '86400');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders
  });
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: NextRequest) {
  const response = new Response(null, { status: 204 });
  return addCorsHeaders(response, req);
}

// Serve the widget test HTML
export async function GET(req: NextRequest) {
  try {
    console.log('Widget-test route handler: Serving widget test page');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marlin Chat Widget Test</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 20px;
        }
        p {
            margin-bottom: 20px;
        }
        code {
            background-color: #f8f8f8;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
        }
        pre {
            background-color: #f8f8f8;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 20px 0;
        }
        .container {
            margin-top: 40px;
        }
        .note {
            background-color: #e7f5fe;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #2196f3;
            margin: 20px 0;
        }
        button {
            background-color: #2196f3;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 10px;
        }
        button:hover {
            background-color: #0d8bf2;
        }
    </style>
</head>
<body>
    <h1>Marlin Chat Widget Test Page</h1>
    <p>This page demonstrates the Marlin AI Chat Widget in action. The chat widget should appear in the bottom right corner of this page.</p>

    <div class="note">
        <p><strong>Note:</strong> This is a test page. The widget is configured to use the standard API endpoint.</p>
    </div>

    <div class="container">
        <h2>How to Embed</h2>
        <p>To embed this chat widget on your website, add the following code to your HTML:</p>
        <pre><code>&lt;script&gt;
    window.marlinConfig = {
        apiEndpoint: "https://marlan.photographytoprofits.com/api/widget-chat",
        title: "Marlin Assistant",
        description: "Ask me anything about photography",
        welcomeMessage: "Hi! I'm Marlin, your photography assistant. How can I help you today?",
        placeholder: "Ask about photography...",
        primaryColor: "#0d8bf2"
    };
    
    (function() {
        var script = document.createElement('script');
        script.src = "https://marlan.photographytoprofits.com/widget/chat-widget.js";
        script.defer = true;
        script.onload = function() {
            console.log("Marlin Chat Widget loaded successfully");
        };
        script.onerror = function() {
            console.error("Failed to load Marlin Chat Widget");
        };
        document.body.appendChild(script);
    })();
&lt;/script&gt;</code></pre>

        <button id="copyButton">Copy Embed Code</button>
    </div>

    <script>
        document.getElementById('copyButton').addEventListener('click', function() {
            var codeBlock = document.querySelector('pre code').textContent;
            navigator.clipboard.writeText(codeBlock)
                .then(() => {
                    this.textContent = 'Copied!';
                    setTimeout(() => {
                        this.textContent = 'Copy Embed Code';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Could not copy text: ', err);
                });
        });

        // Load the widget for this test page
        window.marlinConfig = {
            apiEndpoint: "https://marlan.photographytoprofits.com/api/widget-chat",
            title: "Marlin Assistant",
            description: "Ask me anything about photography",
            welcomeMessage: "Hi! I'm Marlin, your photography assistant. How can I help you today?",
            placeholder: "Ask about photography...",
            primaryColor: "#0d8bf2",
            debug: true
        };
        
        (function() {
            var script = document.createElement('script');
            script.src = "/widget/chat-widget.js";
            script.defer = true;
            script.onload = function() {
                console.log("Marlin Chat Widget loaded successfully");
            };
            script.onerror = function() {
                console.error("Failed to load Marlin Chat Widget");
            };
            document.body.appendChild(script);
        })();
    </script>
</body>
</html>`;

    const response = new Response(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
    
    return addCorsHeaders(response, req);
  } catch (error) {
    console.error('Widget-test route handler: Error serving widget test page:', error);
    const errorResponse = new Response('Error loading widget test page', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
    return addCorsHeaders(errorResponse, req);
  }
} 