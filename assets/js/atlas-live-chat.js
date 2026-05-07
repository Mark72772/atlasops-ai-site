(function () {
  const config = window.AtlasLiveChatConfig || {};
  const siteId = config.siteId || "atlasops-ai";
  const storageKey = "atlasops_live_chat_session";
  const transcriptKey = "atlasops_live_chat_transcript";
  const workerUrl = safeWorkerUrl(config.workerUrl || "https://atlasops-live-chat.atlasops-ai.workers.dev");
  let socket = null;
  let pollTimer = null;
  let sentCount = 0;

  function safeWorkerUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!/^https:$/i.test(url.protocol)) return "";
      if (/(^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\.|file:)/i.test(url.hostname)) return "";
      return url.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function id() {
    return crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function sessionId() {
    let value = sessionStorage.getItem(storageKey);
    if (!value) {
      value = id();
      sessionStorage.setItem(storageKey, value);
    }
    return value;
  }

  function transcript() {
    try {
      return JSON.parse(sessionStorage.getItem(transcriptKey) || "[]");
    } catch {
      return [];
    }
  }

  function saveTranscript(items) {
    sessionStorage.setItem(transcriptKey, JSON.stringify(items.slice(-80)));
  }

  function addMessage(role, text) {
    const items = transcript();
    items.push({ role, text, created_at: new Date().toISOString() });
    saveTranscript(items);
    renderMessages();
  }

  function payload(text) {
    const panel = document.querySelector("[data-atlas-live-chat-panel]");
    const email = panel?.querySelector("[name='atlas_chat_email']")?.value || "";
    const name = panel?.querySelector("[name='atlas_chat_name']")?.value || "";
    const company = panel?.querySelector("[name='atlas_chat_company']")?.value || "";
    const service = panel?.querySelector("[name='atlas_chat_service']")?.value || "";
    const params = new URLSearchParams(window.location.search);
    return {
      message_id: id(),
      session_id: sessionId(),
      role: "visitor",
      text,
      email: email || null,
      name: name || null,
      company: company || null,
      service_interest: service || null,
      page_path: window.location.pathname,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      site_id: siteId,
      created_at: new Date().toISOString(),
    };
  }

  function setState(state, text) {
    document.body.dataset.atlasChatState = state;
    document.dispatchEvent(new CustomEvent("atlas-orb-state", { detail: { state } }));
    document.querySelectorAll("[data-atlas-chat-status]").forEach((node) => {
      node.textContent = text || state;
      node.dataset.status = state;
    });
  }

  function buildWidget() {
    if (document.querySelector("[data-atlas-live-chat-root]")) return;
    const root = document.createElement("div");
    root.dataset.atlasLiveChatRoot = "true";
    root.innerHTML = `
      <button class="atlas-chat-bubble" type="button" data-atlas-chat-toggle aria-expanded="false">
        <span class="atlas-chat-bubble-mark" aria-hidden="true"></span>
        <span>Ask Atlas</span>
      </button>
      <section class="atlas-chat-panel" data-atlas-live-chat-panel aria-label="Ask Atlas chat" hidden>
        <header class="atlas-chat-head">
          <div>
            <strong>Ask Atlas</strong>
            <span data-atlas-chat-status>Checking relay...</span>
          </div>
          <button type="button" data-atlas-chat-close aria-label="Close chat">x</button>
        </header>
        <div class="atlas-chat-meta">
          <input name="atlas_chat_name" placeholder="Name">
          <input name="atlas_chat_email" type="email" placeholder="Email for follow-up">
          <input name="atlas_chat_company" placeholder="Company">
          <select name="atlas_chat_service" aria-label="Service interest">
            <option value="">Service interest</option>
            <option>AI Business Automation Audit</option>
            <option>Website + PayPal CTA Setup</option>
            <option>Social Content System</option>
            <option>Code Intelligence / Spec-Driven Audit</option>
            <option>Company SWOT Pilot</option>
            <option>Atlas Native Coding CLI</option>
          </select>
        </div>
        <div class="atlas-chat-chips" aria-label="Quick questions">
          <button type="button">Can Atlas review my website?</button>
          <button type="button">What should I automate first?</button>
          <button type="button">Can Atlas review code?</button>
          <button type="button">How do I start an audit?</button>
        </div>
        <div class="atlas-chat-messages" data-atlas-chat-messages></div>
        <p class="atlas-chat-safety">Do not send passwords, API keys, payment card data, private files, or sensitive customer data here.</p>
        <form class="atlas-chat-compose" data-atlas-chat-form>
          <textarea name="message" rows="2" placeholder="Ask Atlas about services, workflows, websites, reports, AI tools, or code." required></textarea>
          <button type="submit">Send</button>
        </form>
      </section>
    `;
    document.body.appendChild(root);
    root.querySelector("[data-atlas-chat-toggle]").addEventListener("click", () => openPanel(true));
    root.querySelector("[data-atlas-chat-close]").addEventListener("click", () => openPanel(false));
    root.querySelectorAll(".atlas-chat-chips button").forEach((button) => {
      button.addEventListener("click", () => sendText(button.textContent.trim()));
    });
    root.querySelector("[data-atlas-chat-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const textarea = event.currentTarget.elements.message;
      sendText(textarea.value.trim());
      textarea.value = "";
    });
    if (!transcript().length) {
      saveTranscript([{ role: "atlas", text: "Hi, I am Atlas. Ask me what to automate, what to fix on your website, or which AtlasOps service fits your situation.", created_at: new Date().toISOString() }]);
    }
    renderMessages();
    connectSocket();
    heartbeat();
  }

  function openPanel(show) {
    const panel = document.querySelector("[data-atlas-live-chat-panel]");
    const toggle = document.querySelector("[data-atlas-chat-toggle]");
    if (!panel || !toggle) return;
    panel.hidden = !show;
    toggle.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) {
      setState("listening", workerUrl ? "Ask Atlas - leave a message" : "Setup unavailable");
      panel.querySelector("textarea")?.focus();
    }
  }

  function renderMessages() {
    const target = document.querySelector("[data-atlas-chat-messages]");
    if (!target) return;
    target.innerHTML = transcript().map((item) => `<article class="atlas-chat-message ${item.role}"><span>${item.role === "atlas" ? "Atlas" : "You"}</span><p>${escapeHtml(item.text)}</p></article>`).join("");
    target.scrollTop = target.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  async function sendText(text) {
    if (!text) return;
    addMessage("visitor", text);
    sentCount += 1;
    setState("thinking", "Sending to Atlas...");
    if (!workerUrl) {
      addMessage("atlas", "The public chat relay is not configured yet. Please use the contact page and leave your email.");
      setState("offline", "Setup unavailable");
      return;
    }
    const body = payload(text);
    try {
      let result;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "visitor_message", message: body }));
        result = { ok: true, status: "sent_to_atlas" };
      } else {
        const response = await fetch(`${workerUrl}/chat/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await response.json();
      }
      setState(result.status === "sent_to_atlas" ? "replying" : "waiting", result.status === "sent_to_atlas" ? "Atlas is online..." : "Message queued");
      startReplyPolling();
    } catch {
      addMessage("atlas", "Atlas could not reach the relay. Please leave your email and AtlasOps will follow up.");
      setState("offline", "Offline - leave email");
    }
  }

  function connectSocket() {
    if (!workerUrl || !("WebSocket" in window)) {
      setState(workerUrl ? "waiting" : "offline", workerUrl ? "Ask Atlas - leave a message" : "Setup unavailable");
      return;
    }
    try {
      const url = new URL(workerUrl);
      url.protocol = "wss:";
      url.pathname = "/chat/ws";
      url.search = `?session_id=${encodeURIComponent(sessionId())}`;
      socket = new WebSocket(url.href);
      socket.addEventListener("open", () => setState("listening", "Ask Atlas - leave a message"));
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "atlas_reply" && payload.reply?.text) {
            addMessage("atlas", payload.reply.text);
            setState("listening", "Ask Atlas live");
          }
        } catch {
          // Ignore malformed relay frames.
        }
      });
      socket.addEventListener("close", () => setState("waiting", "Ask Atlas - queued fallback"));
    } catch {
      setState("waiting", "Ask Atlas - leave a message");
    }
  }

  function startReplyPolling() {
    clearInterval(pollTimer);
    pollReply();
    pollTimer = setInterval(pollReply, 8000);
  }

  async function pollReply() {
    if (!workerUrl || sentCount < 1) return;
    try {
      const response = await fetch(`${workerUrl}/chat/reply/${encodeURIComponent(sessionId())}`);
      const body = await response.json();
      const replies = body.replies || [];
      const current = transcript();
      replies.forEach((reply) => {
        const text = reply.text || reply.reply_text;
        if (text && !current.some((item) => item.role === "atlas" && item.text === text)) {
          addMessage("atlas", text);
          setState("listening", "Ask Atlas live");
        }
      });
    } catch {
      setState("waiting", "Waiting for Atlas");
    }
  }

  async function heartbeat() {
    if (!workerUrl) return;
    try {
      await fetch(`${workerUrl}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId(), site_id: siteId, page_path: window.location.pathname, created_at: new Date().toISOString() }),
      });
    } catch {
      // Heartbeat failure should not block chat composition.
    }
    setTimeout(heartbeat, 30000);
  }

  document.addEventListener("DOMContentLoaded", buildWidget);
})();
