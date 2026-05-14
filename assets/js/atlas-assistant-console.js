(function () {
  const cfg = window.ATLAS_ASSISTANT_CONFIG || window.ATLAS_LIVE_CHAT_CONFIG || {};
  const consoleEl = document.getElementById("atlas-public-chat-console");
  if (!consoleEl) return;

  const siteId = cfg.siteId || "atlasops-ai";
  const config = {
    relayUrl: safeRelayUrl(cfg.relayUrl || cfg.workerUrl || ""),
    healthEndpoint: cfg.healthEndpoint || "/health",
    messageEndpoint: cfg.messageEndpoint || "/chat/message",
    replyEndpointPrefix: cfg.replyEndpointPrefix || "/reply/",
    sessionEndpointPrefix: cfg.sessionEndpointPrefix || "/chat/session/"
  };
  const thread = document.getElementById("atlas-chat-thread");
  const form = document.getElementById("atlas-chat-form");
  const input = document.getElementById("atlas-chat-input");
  const status = document.getElementById("atlas-chat-status");
  const email = document.getElementById("atlas-chat-email");
  const sessionKey = "atlasops_public_console_session";
  const historyKey = "atlasops_public_console_history";
  let activePoll = null;
  let typingNode = null;

  function safeRelayUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      const loopbackIp = ["127", "0", "0", "1"].join(".");
      const loopbackHost = ["local", "host"].join("");
      if (url.protocol !== "https:") return "";
      if (host === loopbackIp || host === loopbackHost || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return "";
      return url.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function makeId(prefix) {
    if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getSessionId() {
    let id = sessionStorage.getItem(sessionKey);
    if (!id) {
      id = makeId("session");
      sessionStorage.setItem(sessionKey, id);
    }
    return id;
  }

  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function readHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(historyKey) || "[]");
    } catch {
      return [];
    }
  }

  function saveHistory(items) {
    sessionStorage.setItem(historyKey, JSON.stringify(items.slice(-40)));
  }

  function appendMessage(role, text, persist = true) {
    const bubble = document.createElement("div");
    bubble.className = `atlas-message atlas-message-${role}`;
    bubble.innerHTML = escapeHtml(text);
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
    if (persist) {
      const history = readHistory();
      history.push({ role, text, created_at: new Date().toISOString() });
      saveHistory(history);
    }
    return bubble;
  }

  function restoreHistory() {
    const history = readHistory();
    if (!history.length) return;
    thread.innerHTML = "";
    history.forEach((item) => appendMessage(item.role, item.text, false));
  }

  function setStatus(text, state) {
    status.textContent = text;
    status.dataset.status = state || "unknown";
    consoleEl.dataset.atlasConsoleState = state || "unknown";
    document.body.dataset.atlasChatState = state || "idle";
    document.dispatchEvent(new CustomEvent("atlas-orb-state", { detail: { state: state || "idle" } }));
  }

  function showTyping() {
    removeTyping();
    typingNode = document.createElement("div");
    typingNode.className = "atlas-message atlas-message-assistant atlas-message-typing";
    typingNode.setAttribute("aria-label", "Atlas is thinking");
    typingNode.innerHTML = "<span></span><span></span><span></span>";
    thread.appendChild(typingNode);
    thread.scrollTop = thread.scrollHeight;
  }

  function removeTyping() {
    if (typingNode) {
      typingNode.remove();
      typingNode = null;
    }
  }

  function queryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign")
    };
  }

  async function checkRelay() {
    if (!config.relayUrl) {
      setStatus("Relay setup pending. Ask a question here and use the contact path for follow-up if needed.", "queued_fallback");
      console.warn("Atlas assistant relay not configured.");
      return;
    }
    try {
      const response = await fetch(`${config.relayUrl}${config.healthEndpoint}`, { method: "GET", cache: "no-store" });
      if (response.ok) {
        const health = await response.json().catch(() => ({}));
        if (health.local_bridge_online) {
          setStatus("Atlas is online.", "live");
        } else if (health.ok) {
          setStatus("Atlas relay is online. Atlas may queue complex replies, but simple questions can still be answered.", "relay_online");
        } else {
          setStatus("Atlas relay is offline. Leave a message for follow-up.", "queued_fallback");
        }
      } else {
        setStatus("Atlas relay is offline. Leave a message for follow-up.", "queued_fallback");
      }
    } catch {
      setStatus("Atlas relay is offline. Leave a message for follow-up.", "queued_fallback");
    }
  }

  function payloadFor(text, messageId) {
    return {
      message_id: messageId,
      session_id: getSessionId(),
      role: "visitor",
      text,
      message: text,
      email: email && email.value ? email.value : null,
      name: null,
      company: null,
      service_interest: null,
      page_path: window.location.pathname,
      source: "atlasops_public_assistant_console",
      site_id: siteId,
      non_production_sample: false,
      created_at: new Date().toISOString(),
      ...queryParams()
    };
  }

  async function sendMessage(text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    appendMessage("user", clean);
    input.value = "";
    showTyping();
    setStatus("Atlas is checking...", "thinking");
    const messageId = makeId("msg");

    if (!config.relayUrl) {
      removeTyping();
      appendMessage("assistant", "Live relay is not connected yet. Use the contact page or start-audit path, and AtlasOps can follow up by email.");
      setStatus("Relay setup pending. No live answer was claimed.", "queued_fallback");
      return;
    }

    try {
      const response = await fetch(`${config.relayUrl}${config.messageEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFor(clean, messageId))
      });
      if (!response.ok) throw new Error("relay_message_failed");
      const result = await response.json();
      const replyKey = result.message_id || messageId;
      const immediateReply = result.reply && (result.reply.text || result.reply.reply_text);
      if (immediateReply) {
        removeTyping();
        appendMessage("assistant", result.reply.text || result.reply.reply_text);
        setStatus(result.answered_by === "worker_simple_tool" ? "Answered immediately by Atlas simple tools through the public relay." : "Atlas replied through the public relay.", result.status || "reply_available");
        return;
      }
      setStatus(result.status === "sent_to_atlas" || result.local_bridge_online ? "Atlas is online. Waiting for the live reply..." : "Atlas relay is online. Atlas may queue complex replies, but simple questions can still be answered.", result.status || "queued");
      pollForReply(replyKey);
    } catch {
      removeTyping();
      appendMessage("assistant", "The public relay did not accept that message. Please use the contact page or start-audit path, and AtlasOps can follow up by email.");
      setStatus("Relay unavailable. No live answer was claimed.", "queued_fallback");
    }
  }

  function pollForReply(messageId) {
    clearInterval(activePoll);
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`${config.relayUrl}${config.replyEndpointPrefix}${encodeURIComponent(messageId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("reply_poll_failed");
        const body = await response.json();
        const replies = body.replies || (body.reply ? [body.reply] : []);
        const reply = replies.find((item) => item && (item.text || item.reply_text));
        if (reply) {
          clearInterval(activePoll);
          removeTyping();
          appendMessage("assistant", reply.text || reply.reply_text);
          setStatus("Atlas replied through the public relay.", "reply_available");
          return;
        }
        if (attempts >= 24) {
          clearInterval(activePoll);
          removeTyping();
          appendMessage("assistant", "Atlas relay is online. Atlas may queue complex replies, but simple questions can still be answered. Leave your email for follow-up if you want AtlasOps to reply directly.");
          setStatus("Queued for local Atlas. Simple deterministic questions should answer immediately through the relay simple-tools layer.", "queued_fallback");
        }
      } catch {
        if (attempts >= 3) {
          clearInterval(activePoll);
          removeTyping();
          appendMessage("assistant", "Atlas could not check the relay reply yet. If you left an email, AtlasOps can follow up.");
          setStatus("Reply polling unavailable. No live answer was claimed.", "queued_fallback");
        }
      }
    };
    poll();
    activePoll = setInterval(poll, 5000);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  document.querySelectorAll(".atlas-chat-chips [data-prompt]").forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.dataset.prompt || button.textContent));
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  restoreHistory();
  consoleEl.dataset.atlasConsoleReady = "true";
  checkRelay();
})();

