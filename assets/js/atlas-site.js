(function () {
  const ATLAS_ASSET_BASE = (() => {
    const script = document.currentScript;
    const src = script?.getAttribute("src") || "assets/js/atlas-site.js";
    return src.replace(/assets\/js\/atlas-site\.js(?:\?.*)?$/, "assets/");
  })();

  function loadAtlasLiveChatAssets() {
    const head = document.head;
    const addStyle = (href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        head.appendChild(link);
      }
    };
    const addScript = (src, onload) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        if (onload) onload();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      if (onload) script.addEventListener("load", onload, { once: true });
      document.body.appendChild(script);
    };
    addStyle(`${ATLAS_ASSET_BASE}css/atlas-live-chat.css`);
    addStyle(`${ATLAS_ASSET_BASE}css/atlas-orb.css`);
    addScript(`${ATLAS_ASSET_BASE}js/atlas-live-chat-config.js`, () => {
      addScript(`${ATLAS_ASSET_BASE}js/atlas-live-chat.js`);
      addScript(`${ATLAS_ASSET_BASE}js/atlas-orb.js`);
    });
  }

  document.addEventListener("DOMContentLoaded", loadAtlasLiveChatAssets);

  const RELAY_WORKER_URL = window.AtlasLiveOpsConfig?.relayWorkerUrl || "https://atlasops-liveops-relay.atlasops-ai.workers.dev";
  const SITE_ID = "atlasops-ai";
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  const SESSION_KEY = "atlasops_public_session_id";
  const EVENT_STORE_KEY = "atlasops_public_events";
  const UTM_STORE_KEY = "atlasops_utm_context";

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function safeRelayUrl() {
    const value = String(RELAY_WORKER_URL || "").trim().replace(/\/+$/, "");
    if (!value) return "";
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const loopback = [["127", "0", "0", "1"].join("."), "local" + "host"];
      const privatePrefixes = [["10"].join("."), ["192", "168"].join("."), "172."];
      if (loopback.includes(host)) return "";
      if (privatePrefixes.some((prefix) => host.startsWith(prefix))) return "";
      return parsed.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  const config = {
    siteId: SITE_ID,
    relayWorkerUrl: safeRelayUrl(),
    status: safeRelayUrl() ? "ready" : "relay_url_missing",
    heartbeatSeconds: 30,
    replyPollSeconds: 10,
    replyPollMaxSeconds: 300,
  };

  function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function captureUTM() {
    const query = new URLSearchParams(window.location.search);
    const stored = JSON.parse(localStorage.getItem(UTM_STORE_KEY) || "{}");
    const context = { ...stored };
    UTM_KEYS.forEach((key) => {
      const value = query.get(key);
      if (value) context[key] = value.slice(0, 160);
    });
    context.referrer = context.referrer || document.referrer || "";
    context.source_page = window.location.pathname;
    if (window.location.pathname.includes("/go/")) context.go_route = window.location.pathname;
    localStorage.setItem(UTM_STORE_KEY, JSON.stringify(context));
    return context;
  }

  const context = captureUTM();

  function baseEvent(type, detail = {}) {
    return {
      event_id: uuid(),
      event_type: type,
      site_id: SITE_ID,
      anonymous_session_id: getSessionId(),
      page_path: window.location.pathname,
      page_title: document.title || "",
      referrer: context.referrer || null,
      utm_source: context.utm_source || null,
      utm_medium: context.utm_medium || null,
      utm_campaign: context.utm_campaign || null,
      utm_content: context.utm_content || null,
      go_route: detail.go_route || context.go_route || null,
      service_interest: detail.service_interest || null,
      timestamp: new Date().toISOString(),
      source: "github_pages",
      ...detail,
    };
  }

  function rememberEvent(event) {
    const events = JSON.parse(sessionStorage.getItem(EVENT_STORE_KEY) || "[]");
    events.push(event);
    sessionStorage.setItem(EVENT_STORE_KEY, JSON.stringify(events.slice(-80)));
    return event;
  }

  async function sendEvent(type, detail = {}) {
    const event = rememberEvent(baseEvent(type, detail));
    if (!config.relayWorkerUrl) return { ok: false, status: "relay_url_missing", event };
    const path = type === "heartbeat" ? "/heartbeat" : type === "go_click" ? "/go-click" : "/event";
    try {
      const response = await fetch(`${config.relayWorkerUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      return { ok: response.ok, status: response.ok ? "sent" : "failed", event, response: await response.json().catch(() => ({})) };
    } catch (error) {
      return { ok: false, status: "failed", event, error: String(error) };
    }
  }

  function sendHeartbeat() {
    if (document.visibilityState === "visible") {
      return sendEvent("heartbeat");
    }
    return Promise.resolve({ ok: false, status: "page_hidden" });
  }

  function trackPageView() {
    return sendEvent("page_view");
  }

  function trackGoClick(href) {
    return sendEvent("go_click", { go_route: href || window.location.pathname });
  }

  function fillHiddenFields(form) {
    [...form.querySelectorAll('input[type="hidden"]')].forEach((field) => {
      if (field.name === "source_page") field.value = window.location.pathname;
      else if (field.name === "referrer") field.value = context.referrer || "";
      else if (field.name === "go_route") field.value = context.go_route || "";
      else if (context[field.name]) field.value = context[field.name];
    });
  }

  function payloadFromForm(form) {
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.anonymous_session_id = getSessionId();
    payload.page_path = window.location.pathname;
    payload.source_page = payload.source_page || window.location.pathname;
    payload.referrer = payload.referrer || context.referrer || "";
    payload.site_id = SITE_ID;
    payload.timestamp = new Date().toISOString();
    return payload;
  }

  function noteFor(form) {
    return form.querySelector(".form-note") || form.closest(".ask-atlas-widget")?.querySelector(".form-note");
  }

  function showStatus(form, state, message) {
    const widget = form.closest(".ask-atlas-widget");
    const note = noteFor(form);
    if (widget) widget.dataset.widgetState = state;
    form.dataset.endpointStatus = config.status;
    form.dataset.endpointType = config.relayWorkerUrl ? "cloudflare_worker" : "none";
    if (note) {
      note.classList.toggle("warning", !["ready", "queued", "waiting_for_atlas", "reply_available"].includes(state));
      note.textContent = message;
    }
  }

  async function submitLead(form) {
    const payload = payloadFromForm(form);
    if (payload.website_confirm) return { ok: false, status: "blocked" };
    await sendEvent("lead_submit", { service_interest: payload.service_interest || "" });
    if (!config.relayWorkerUrl) return { ok: false, status: "relay_url_missing" };
    const response = await fetch(`${config.relayWorkerUrl}/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.ok ? "submitted" : "failed", response: await response.json().catch(() => ({})) };
  }

  async function submitAskAtlasQuestion(form) {
    const payload = payloadFromForm(form);
    if (payload.website_confirm) return { ok: false, status: "blocked" };
    payload.question = payload.question || payload.message || "";
    await sendEvent("ask_atlas_submit", { service_interest: payload.service_interest || "" });
    if (!config.relayWorkerUrl) return { ok: false, status: "relay_url_missing" };
    const response = await fetch(`${config.relayWorkerUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.ok ? "queued" : "failed", question_id: body.question_id, response: body };
  }

  async function pollReply(questionId, form) {
    if (!config.relayWorkerUrl || !questionId) return { ok: false, status: "offline_email_fallback" };
    const started = Date.now();
    showStatus(form, "waiting_for_atlas", "Question received. Atlas is checking this. Keep this page open for a reply or watch your email.");
    while (Date.now() - started < config.replyPollMaxSeconds * 1000) {
      await new Promise((resolve) => setTimeout(resolve, config.replyPollSeconds * 1000));
      await sendEvent("reply_poll", { question_id: questionId });
      const response = await fetch(`${config.relayWorkerUrl}/reply/${encodeURIComponent(questionId)}`);
      const body = await response.json().catch(() => ({}));
      if (body.status === "reply_available" && body.reply) {
        showStatus(form, "reply_available", body.reply.reply_text || "Atlas replied.");
        return { ok: true, status: "reply_available", reply: body.reply };
      }
    }
    showStatus(form, "offline_email_fallback", "Atlas will follow up by email when the local operator syncs.");
    return { ok: false, status: "offline_email_fallback" };
  }

  function initializeForms() {
    document.querySelectorAll(".atlasops-lead-form").forEach((form) => {
      fillHiddenFields(form);
      if (!config.relayWorkerUrl) {
        showStatus(form, "relay_url_missing", "Ask Atlas relay URL is missing. Use email fallback while AtlasOps repairs public configuration.");
        const submit = form.querySelector('[type="submit"]');
        if (submit) submit.textContent = "Email fallback";
      } else {
        showStatus(form, "ready", "Relay ready. Ask Atlas is live when Atlas is online, with email fallback when offline.");
      }
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const isAsk = form.classList.contains("ask-atlas-widget-form");
        showStatus(form, "submitting", "Sending...");
        const result = isAsk ? await submitAskAtlasQuestion(form) : await submitLead(form);
        if (result.status === "relay_url_missing") {
          await sendEvent("form_error", { reason: "relay_url_missing" });
          showStatus(form, "relay_url_missing", "Ask Atlas relay URL is missing. Your question was not sent yet. Use email fallback while AtlasOps repairs public configuration.");
          return;
        }
        if (!result.ok) {
          showStatus(form, "failed", "The relay did not accept the message. Please try again or use email fallback.");
          return;
        }
        if (isAsk && result.question_id) {
          showStatus(form, "queued", "Question received. Atlas is checking this. Keep this page open for a reply or watch your email.");
          pollReply(result.question_id, form);
        } else {
          showStatus(form, "queued", "Thanks. AtlasOps received your message and will review it.");
        }
      });
    });
  }

  function initializeClicks() {
    document.querySelectorAll("[data-go-route], .button.gold, a[href*='/go/'], a[href*='paypal.me']").forEach((link) => {
      link.addEventListener("click", () => trackGoClick(link.getAttribute("href") || ""));
    });
  }

  function initializeCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.getAttribute("data-copy") || "";
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy link";
        }, 1200);
      });
    });
  }

  async function initializeNewsfeed() {
    const hosts = document.querySelectorAll("[data-newsfeed-list]");
    if (!hosts.length) return;
    try {
      const response = await fetch("data/newsfeed.json", { cache: "no-store" });
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
      hosts.forEach((host) => {
        host.innerHTML = items.map((item) => `
          <article class="news-item">
            <div class="news-topic">${item.topic || "Industry Watch"}</div>
            <h3>${item.title || "AI business signal"}</h3>
            <p>${item.business_takeaway || item.summary || "Source-backed update for business operators."}</p>
            <a href="${item.source_url}" rel="noopener">Read source</a>
          </article>
        `).join("") || "<p>No source-backed items are available yet.</p>";
      });
    } catch {
      hosts.forEach((host) => {
        host.innerHTML = "<p>Industry Watch is temporarily unavailable. Ask Atlas for the latest service guidance.</p>";
      });
    }
  }

  function initializeQuickPrompts() {
    document.querySelectorAll("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => {
        const prompt = button.getAttribute("data-prompt") || "";
        const target = document.querySelector("#atlas-chat-input, textarea[name='question'], textarea[name='message']");
        if (target) {
          target.value = prompt;
          target.focus();
        }
      });
    });
  }

  window.AtlasLiveOps = {
    config,
    getSessionId,
    captureUTM,
    sendEvent,
    sendHeartbeat,
    trackPageView,
    trackGoClick,
    submitLead,
    submitAskAtlasQuestion,
    pollReply,
    showStatus,
  };

  trackPageView();
  let heartbeatTimer = null;
  function startHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(sendHeartbeat, config.heartbeatSeconds * 1000);
    sendHeartbeat();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") startHeartbeat();
  });
  startHeartbeat();
  initializeForms();
  initializeClicks();
  initializeCopyButtons();
  initializeQuickPrompts();
  initializeNewsfeed();
})();
