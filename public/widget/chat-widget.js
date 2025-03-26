"use strict";(()=>{(function(){if(window.marlinChatWidgetLoaded){console.warn("Marlin Chat Widget already loaded. Skipping initialization.");return}window.marlinChatWidgetLoaded=!0;let x={position:"bottom-right",title:"Ask Marlin",primaryColor:"#0070f3",bubbleIcon:null,apiEndpoint:"https://thehighrollersclub.io/api/widget-chat",width:"350px",height:"500px",zIndex:9999};function w(){let e=document.createElement("style");e.id="marlin-chat-widget-styles",e.innerHTML=`
      .marlin-chat-widget-container {
        position: fixed;
        z-index: ${i.zIndex};
        max-height: ${i.height};
        width: ${i.width};
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
        background-color: ${i.primaryColor};
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
        background-color: ${i.primaryColor};
        border: none;
        border-radius: 8px;
        color: #ffffff;
        cursor: pointer;
        padding: 8px 12px;
        margin-left: 8px;
      }

      .marlin-chat-widget-bubble {
        position: fixed;
        z-index: ${i.zIndex};
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${i.primaryColor};
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
        background-color: ${i.primaryColor};
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
    `,document.head.appendChild(e)}function b(){let e=document.createElement("div");e.className=`marlin-chat-widget-bubble ${i.position}`,e.innerHTML=i.bubbleIcon?`<img src="${i.bubbleIcon}" alt="Chat" width="30" height="30">`:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="#ffffff"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',document.body.appendChild(e);let a=document.createElement("div");a.className=`marlin-chat-widget-container ${i.position}`,a.style.display="none";let n=document.createElement("div");n.className="marlin-chat-widget-header",n.innerHTML=`
      <h3 class="marlin-chat-widget-title">${i.title}</h3>
      <button class="marlin-chat-widget-close">&times;</button>
    `;let s=document.createElement("div");s.className="marlin-chat-widget-messages";let r=document.createElement("div");return r.className="marlin-chat-widget-input-container",r.innerHTML=`
      <input type="text" class="marlin-chat-widget-input" placeholder="Type your message...">
      <button class="marlin-chat-widget-send">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    `,a.appendChild(n),a.appendChild(s),a.appendChild(r),document.body.appendChild(a),{bubble:e,container:a,messagesContainer:s,closeButton:n.querySelector(".marlin-chat-widget-close"),input:r.querySelector(".marlin-chat-widget-input"),sendButton:r.querySelector(".marlin-chat-widget-send")}}function c(e,a="assistant"){let n=document.createElement("div");n.className=`marlin-chat-widget-message ${a}`,n.innerHTML=e.replace(/\n/g,"<br>"),t.messagesContainer.appendChild(n),t.messagesContainer.scrollTop=t.messagesContainer.scrollHeight}function y(){let e=document.createElement("div");e.className="marlin-chat-widget-typing",e.innerHTML=`
      <div class="marlin-chat-widget-typing-dot"></div>
      <div class="marlin-chat-widget-typing-dot"></div>
      <div class="marlin-chat-widget-typing-dot"></div>
    `,e.id="marlin-chat-widget-typing",t.messagesContainer.appendChild(e),t.messagesContainer.scrollTop=t.messagesContainer.scrollHeight}function g(){let e=document.getElementById("marlin-chat-widget-typing");e&&e.remove()}function h(){t.container.style.display!=="none"?(t.container.classList.remove("open"),setTimeout(()=>{t.container.style.display="none"},300)):(t.container.style.display="flex",setTimeout(()=>{t.container.classList.add("open"),t.input.focus()},10))}function v(){let e=localStorage.getItem("marlin-chat-session-id");return e||(e="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(a){let n=Math.random()*16|0;return(a==="x"?n:n&3|8).toString(16)}),localStorage.setItem("marlin-chat-session-id",e)),e}async function u(e){if(e.trim()){c(e,"user"),t.input.value="",y();try{let a=v();console.log("Sending message to widget API:",e);let n=await fetch(i.apiEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:e,sessionId:a})});if(console.log("Response status:",n.status),console.log("Response content-type:",n.headers.get("content-type")),!n.ok){try{let o=await n.json();console.error("API error:",o),g();let p=o.message||o.error||`Error: ${n.status} ${n.statusText}`;c(`Sorry, there was a problem: ${p}. Please try again later.`,"assistant")}catch(o){console.error("Failed to parse error response:",o),g(),c(`Sorry, there was an error (${n.status}). Please try again later.`,"assistant")}return}let s=n.body.getReader(),r=new TextDecoder;g();let l=document.createElement("div");l.className="marlin-chat-widget-message assistant",t.messagesContainer.appendChild(l);let d="";try{for(;;){let{done:p,value:k}=await s.read();if(p){console.log("Stream complete");break}let m=r.decode(k,{stream:!0});console.log("Received chunk:",JSON.stringify(m)),m.trim()&&(d+=m,l.innerHTML=d.replace(/\n/g,"<br>"),t.messagesContainer.scrollTop=t.messagesContainer.scrollHeight)}let o=r.decode();o.trim()&&(console.log("Final chunk:",JSON.stringify(o)),d+=o,l.innerHTML=d.replace(/\n/g,"<br>")),d.trim()||(console.warn("Empty response received from streaming API"),l.innerHTML="I'm sorry, I couldn't find specific information about that in my knowledge base. Please try asking in a different way or about another topic."),console.log("Final response text:",d)}catch(o){console.error("Error processing stream:",o),l.innerHTML="Sorry, there was an error processing the response stream. Please try again."}}catch(a){console.error("Error sending message:",a),g(),c("Sorry, there was an error connecting to the server. Please check your connection and try again later.","assistant")}}}function C(){t.bubble.addEventListener("click",h),t.closeButton.addEventListener("click",h),t.sendButton.addEventListener("click",()=>{u(t.input.value)}),t.input.addEventListener("keypress",e=>{e.key==="Enter"&&u(t.input.value)})}function f(e={}){i={...x,...e},w(),t=b(),c("Hi there! How can I help you today?"),C(),console.log("Marlin Chat Widget initialized successfully")}window.initChatWidget=f;let i,t;window.marlinChatConfig&&f(window.marlinChatConfig)})();})();
//# sourceMappingURL=chat-widget.js.map
