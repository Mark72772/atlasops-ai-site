(function () {
  const rawConfig = window.ATLAS_LIVE_CHAT_CONFIG || window.AtlasLiveChatConfig || {};
  const siteId = rawConfig.siteId || "atlasops-ai";
  const config = {
    relayUrl: safeRelayUrl(rawConfig.relayUrl || rawConfig.workerUrl || ""),
    askEndpoint: rawConfig.askEndpoint || "/ask",
    healthEndpoint: rawConfig.healthEndpoint || "/health",
    replyEndpointPrefix: rawConfig.replyEndpointPrefix || "/reply/",
    safeFallbackEmail: rawConfig.safeFallbackEmail || "",
    enableFloatingWidget: rawConfig.enableFloatingWidget !== false,
    enableQuickPrompts: rawConfig.enableQuickPrompts !== false,
    enableOrbState: rawConfig.enableOrbState !== false
  };

  const storageKey = "atlasops_live_chat_session";
  const transcriptKey = "atlasops_live_chat_transcript";
  const rootId = "atlas-live-chat-root";
  const fallbackText = "I can still help from public visitor mode. Tell me where the workflow leaks: website clarity, contact path, follow-up, card processing, monitoring, or an agent pack.";
  let pollTimer = null;
  let lastQuestionId = "";

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

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function sessionId() {
    let value = sessionStorage.getItem(storageKey);
    if (!value) {
      value = uuid();
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

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function setOrbState(state) {
    if (!config.enableOrbState) return;
    document.body.dataset.atlasChatState = state;
    document.dispatchEvent(new CustomEvent("atlas-orb-state", { detail: { state } }));
  }

  function setStatus(state, bubbleLabel, statusLine) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.dataset.atlasChatState = state;
    root.querySelectorAll("[data-atlas-chat-badge]").forEach((node) => {
      node.textContent = bubbleLabel;
      node.dataset.status = state;
    });
    root.querySelectorAll("[data-atlas-chat-status]").forEach((node) => {
      node.textContent = statusLine || bubbleLabel;
      node.dataset.status = state;
    });
    setOrbState(state === "live" ? "listening" : state);
  }

  function addMessage(role, text) {
    const items = transcript();
    items.push({ role, text, created_at: new Date().toISOString() });
    saveTranscript(items);
    renderMessages();
  }

  function renderMessages() {
    const target = document.querySelector("[data-atlas-chat-messages]");
    if (!target) return;
    target.innerHTML = transcript().map((item) => (
      `<article class="atlas-chat-message ${item.role === "visitor" ? "visitor" : "atlas"}"><span>${item.role === "visitor" ? "You" : "Atlas"}</span><p>${escapeHtml(item.text)}</p></article>`
    )).join("");
    target.scrollTop = target.scrollHeight;
  }

  function contactPayload(text) {
    const root = document.getElementById(rootId);
    const params = new URLSearchParams(window.location.search);
    return {
      session_id: sessionId(),
      message: text,
      email: root?.querySelector("[name='atlas_chat_email']")?.value || null,
      name: root?.querySelector("[name='atlas_chat_name']")?.value || null,
      company: root?.querySelector("[name='atlas_chat_company']")?.value || null,
      service_interest: root?.querySelector("[name='atlas_chat_service']")?.value || null,
      page_path: window.location.pathname,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      source: "atlasops_public_chat",
      non_production_sample: false,
      site_id: siteId,
      created_at: new Date().toISOString()
    };
  }

  function ensureGreeting() {
    if (transcript().length) return;
    saveTranscript([{
      role: "atlas",
      text: "Hi, I\u2019m Atlas. Tell me where the workflow leaks: missed follow-ups, confusing website, card processing, monthly checks, or an agent pack. I will recommend the smallest next step.",
      created_at: new Date().toISOString()
    }]);
  }

  function ensureRoot() {
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement("div");
      root.id = rootId;
      document.body.appendChild(root);
    }
    return root;
  }

  function buildWidget() {
    if (document.getElementById("atlas-public-chat-console")) return;
    if (!config.enableFloatingWidget) return;
    const root = ensureRoot();
    if (root.dataset.widgetReady === "true") return;
    root.dataset.widgetReady = "true";
    root.innerHTML = `
      <button class="atlas-chat-bubble" type="button" data-atlas-chat-toggle aria-label="Ask Atlas chat" aria-expanded="false">
        <span class="atlas-chat-bubble-mark" aria-hidden="true"></span>
        <span class="atlas-chat-bubble-text">
          <span class="atlas-chat-bubble-title">Ask Atlas</span>
          <span class="atlas-chat-bubble-badge" data-atlas-chat-badge>Checking...</span>
        </span>
      </button>
      <section class="atlas-chat-panel" data-atlas-live-chat-panel aria-label="Ask Atlas" hidden>
        <header class="atlas-chat-head">
          <div>
            <strong>Ask Atlas</strong>
            <span data-atlas-chat-status>Checking relay...</span>
          </div>
          <button type="button" data-atlas-chat-close aria-label="Close Ask Atlas chat">x</button>
        </header>
        <div class="atlas-chat-meta">
          <input name="atlas_chat_name" autocomplete="name" placeholder="Name">
          <input name="atlas_chat_email" type="email" autocomplete="email" placeholder="Email for follow-up">
          <input name="atlas_chat_company" autocomplete="organization" placeholder="Company">
          <select name="atlas_chat_service" aria-label="Service interest">
            <option value="">Service interest</option>
            <option>Free AI Visibility + Workflow Review</option>
            <option>$297 Quick Fix Setup</option>
            <option>$497 AI Follow-Up Starter</option>
            <option>$97/month Monitoring</option>
            <option>Merchant / CreditLine Technical Support</option>
            <option>$99 Agent Workflow Pack</option>
          </select>
        </div>
        <div class="atlas-chat-chips" aria-label="Quick prompts" data-atlas-chat-chips>
          <button type="button">I miss follow-ups</button>
          <button type="button">My website is confusing</button>
          <button type="button">I need card processing</button>
          <button type="button">I want monthly checks</button>
          <button type="button">I need an AI agent pack</button>
          <button type="button">What is Atlas AIOS?</button>
        </div>
        <div class="atlas-chat-messages" data-atlas-chat-messages></div>
        <p class="atlas-chat-safety">Do not send passwords, API keys, payment card data, private files, or sensitive customer data.</p>
        <form class="atlas-chat-compose" data-atlas-chat-form>
          <textarea name="message" rows="2" placeholder="Ask Atlas a question..." required></textarea>
          <button type="submit">Send</button>
        </form>
      </section>
    `;

    root.querySelector("[data-atlas-chat-toggle]").addEventListener("click", () => openPanel(true));
    root.querySelector("[data-atlas-chat-close]").addEventListener("click", () => openPanel(false));
    root.querySelector("[data-atlas-chat-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const textarea = event.currentTarget.elements.message;
      sendText(textarea.value.trim());
      textarea.value = "";
    });
    root.querySelectorAll("[data-atlas-chat-chips] button").forEach((button) => {
      button.addEventListener("click", () => sendText(button.textContent.trim()));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") openPanel(false);
    });
    ensureGreeting();
    renderMessages();
    checkRelay();
  }

  function openPanel(show) {
    const panel = document.querySelector("[data-atlas-live-chat-panel]");
    const toggle = document.querySelector("[data-atlas-chat-toggle]");
    if (!panel || !toggle) return;
    panel.hidden = !show;
    toggle.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) {
      panel.querySelector("textarea")?.focus();
      setOrbState("listening");
    }
  }

  async function checkRelay() {
    if (!config.relayUrl) {
      console.warn("Atlas live chat relay not configured.");
      setStatus("offline", "Leave message", "Atlas relay is offline. Leave a message for follow-up.");
      return;
    }
    try {
      const response = await fetch(`${config.relayUrl}${config.healthEndpoint}`, { method: "GET" });
      if (response.ok) {
        const health = await response.json().catch(() => ({}));
        if (health.local_bridge_online) {
          setStatus("live", "Online", "Atlas is online.");
        } else {
          setStatus("relay", "Online relay", "Atlas relay is online. Atlas may queue complex replies, but simple questions can still be answered.");
        }
      } else {
        setStatus("offline", "Leave message", "Atlas relay is offline. Leave a message for follow-up.");
      }
    } catch {
      setStatus("offline", "Leave message", "Atlas relay is offline. Leave a message for follow-up.");
    }
  }


  function publicVisitorAnswer(text) {
    const q = String(text || "").toLowerCase();
    if (/joke/.test(q)) return "Why did the follow-up email become an AI agent? Because it was tired of being left on read. If you want the practical version, Atlas can inspect where your real follow-up leaks.";
    if (/credit card|merchant|gateway|restaurant|statement|payment processing|pos/.test(q)) return "That belongs in the Merchant / CreditLine lane. Atlas can route payment processing, gateway, merchant account, or statement review questions toward Mark Wilson / CreditLine Technical Support / Cloud9 Payment Processing Gateway / 911 Software. Do not send card data or credentials here.";
    if (/follow|reply|lead|forget|forgot|handoff|quote|inquiry/.test(q)) return "That sounds like a follow-up leak. Start with the Free Review if Atlas should inspect the contact path first; use the $497 AI Follow-Up Starter when leads already arrive but first response or handoff is inconsistent.";
    if (/monitor|monthly|drift|checked/.test(q)) return "Monitoring is the $97/month path for keeping contact paths, CTAs, broken links, and follow-up workflow from drifting after the main setup works.";
    if (/agent pack|custom agent|code|workflow pack|builder/.test(q)) return "A $99 Agent Workflow Pack fits repeated work that needs instructions, guardrails, proof rules, or setup help. Name the workflow and Atlas can point you to the pack or setup review.";
    if (/atlas aios|what is atlas|operating system/.test(q)) return "Atlas AIOS is the operating layer behind AtlasOps: agents, memory, proof, long-horizon tasks, system cards, capability cards, and daily operating loops. The public offers are the buyer-facing way to start.";
    if (/website|confusing|cta|seo|visibility|ai answer|quick fix/.test(q)) return "That sounds like a visibility or contact-path leak. Start with the Free Review if Atlas should inspect the public page, or the $297 Quick Fix if the narrow repair is already clear.";
    return fallbackText;
  }

  async function sendText(text) {
    if (!text) return;
    addMessage("visitor", text);
    setStatus("thinking", "Checking...", "Atlas is checking...");
    setOrbState("thinking");
    if (!config.relayUrl) {
      addMessage("atlas", publicVisitorAnswer(text));
      setStatus("offline", "Leave message", "Relay setup pending — this message will use fallback instructions.");
      return;
    }
    const body = contactPayload(text);
    try {
      const result = await postMessage(body);
      const questionId = result.question_id || result.session_id || body.session_id;
      lastQuestionId = questionId;
      addMessage("atlas", "Atlas is checking...");
      setStatus(result.status === "sent_to_atlas" || result.status === "reply_available" ? "live" : "relay", result.status === "sent_to_atlas" ? "Live" : "Online relay", result.status === "sent_to_atlas" ? "Atlas is online." : "Atlas relay is online. Atlas may queue complex replies, but simple questions can still be answered.");
      pollForReply(questionId);
    } catch {
      addMessage("atlas", publicVisitorAnswer(text));
      setStatus("offline", "Leave message", "Atlas relay is offline. Leave a message for follow-up.");
    }
  }

  async function postMessage(body) {
    const askUrl = `${config.relayUrl}${config.askEndpoint}`;
    let response = await fetch(askUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok && config.askEndpoint !== "/chat/message") {
      response = await fetch(`${config.relayUrl}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, text: body.message, role: "visitor" })
      });
    }
    if (!response.ok) throw new Error("relay_post_failed");
    return response.json();
  }

  function pollForReply(questionId) {
    clearInterval(pollTimer);
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`${config.relayUrl}${config.replyEndpointPrefix}${encodeURIComponent(questionId)}`);
        const body = await response.json();
        const replies = body.replies || (body.reply ? [body.reply] : []);
        const current = transcript();
        const newReply = replies.find((reply) => {
          const text = reply.text || reply.reply_text;
          return text && !current.some((item) => item.role === "atlas" && item.text === text);
        });
        if (newReply) {
          addMessage("atlas", newReply.text || newReply.reply_text);
          setStatus("live", "Live", "Atlas is online — replies can appear here.");
          clearInterval(pollTimer);
        } else if (attempts >= 30) {
          addMessage("atlas", "Atlas has your message. If you left an email, AtlasOps can follow up.");
          clearInterval(pollTimer);
        }
      } catch {
        if (attempts >= 3) {
          setStatus("offline", "Leave message", "Atlas relay is offline. Leave a message for follow-up.");
        }
      }
    };
    poll();
    pollTimer = setInterval(poll, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget, { once: true });
  } else {
    buildWidget();
  }
})();

