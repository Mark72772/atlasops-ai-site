const SITE_ID = "atlasops-ai";
const ACTIVE_WINDOW_MS = 120000;
const BRIDGE_HEARTBEAT_WINDOW_MS = 30000;
const MAX_MESSAGES = 800;
const MAX_SESSIONS = 300;
const ALLOWED_ORIGINS = new Set([
  "https://mark72772.github.io",
  "https://mark72772.github.io/atlasops-ai-site",
]);

function now() {
  return new Date().toISOString();
}

function uuid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function trim(items, limit = MAX_MESSAGES) {
  return items.slice(Math.max(0, items.length - limit));
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set([...ALLOWED_ORIGINS, ...configured]);
  if (!allowed.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-atlas-relay-secret",
    "vary": "Origin",
  };
}

function withCors(request, response, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function adminAllowed(request, env) {
  const expected = env.ATLAS_RELAY_SECRET || "";
  const provided = request.headers.get("x-atlas-relay-secret") || "";
  return Boolean(expected && provided && provided === expected);
}

function room(env) {
  if (!env.ATLAS_CHAT_ROOM) return null;
  return env.ATLAS_CHAT_ROOM.get(env.ATLAS_CHAT_ROOM.idFromName(SITE_ID));
}

async function forwardToRoom(request, env, path, body = undefined) {
  const target = room(env);
  if (!target) {
    return json({
      ok: false,
      status: "setup_required",
      error: "durable_object_binding_missing",
      next_action: "Bind ATLAS_CHAT_ROOM in wrangler.toml and deploy again.",
    }, { status: 503 });
  }
  const url = new URL(request.url);
  url.pathname = path;
  return target.fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body,
  });
}

function normalizeMessage(payload, defaults = {}) {
  const text = String(payload.text || payload.message || payload.question || "").trim().slice(0, 2500);
  return {
    message_id: payload.message_id || uuid("msg"),
    session_id: payload.session_id || defaults.session_id || uuid("session"),
    role: payload.role || defaults.role || "visitor",
    text,
    email: payload.email || null,
    name: payload.name || null,
    company: payload.company || null,
    service_interest: payload.service_interest || null,
    page_path: payload.page_path || payload.source_page || defaults.page_path || "/",
    utm_source: payload.utm_source || null,
    utm_medium: payload.utm_medium || null,
    utm_campaign: payload.utm_campaign || null,
    created_at: payload.created_at || now(),
    status: payload.status || "received",
    non_production_sample: Boolean(payload.non_production_sample || payload.is_non_production_sample),
  };
}

const SIMPLE_TIMEZONES = [
  ["japan", "Japan", "Asia/Tokyo", "JST"],
  ["tokyo", "Tokyo", "Asia/Tokyo", "JST"],
  ["china", "China", "Asia/Shanghai", "CST"],
  ["shanghai", "Shanghai", "Asia/Shanghai", "CST"],
  ["beijing", "Beijing", "Asia/Shanghai", "CST"],
  ["uk", "UK", "Europe/London", "GMT/BST"],
  ["united kingdom", "UK", "Europe/London", "GMT/BST"],
  ["london", "London", "Europe/London", "GMT/BST"],
  ["germany", "Germany", "Europe/Berlin", "CET/CEST"],
  ["berlin", "Berlin", "Europe/Berlin", "CET/CEST"],
  ["california", "California", "America/Los_Angeles", "Pacific Time"],
  ["new york", "New York", "America/New_York", "Eastern Time"],
  ["texas", "Texas", "America/Chicago", "Central Time"],
  ["utc", "UTC", "UTC", "UTC"],
];

function wordMatch(text, needle) {
  return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function simpleTimeReply(location, timezone, abbreviation) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
  return `It is ${formatted} in ${location} right now (${timezone}, ${abbreviation}).`;
}

function bridgeSnapshot(agentStatus, connectedAgents = 0) {
  const updatedAt = agentStatus && (agentStatus.updated_at || agentStatus.timestamp || agentStatus.last_bridge_heartbeat_at);
  const lastHeartbeat = updatedAt || null;
  const freshHeartbeat = Boolean(lastHeartbeat && Date.now() - Date.parse(lastHeartbeat) <= BRIDGE_HEARTBEAT_WINDOW_MS);
  const localBridgeOnline = Boolean(
    freshHeartbeat &&
    (agentStatus.local_bridge_online === true || agentStatus.atlas_responder_available === true || agentStatus.status === "live_online")
  );
  return {
    local_bridge_online: localBridgeOnline,
    last_bridge_heartbeat_at: lastHeartbeat,
    bridge_status: localBridgeOnline ? "live_online" : connectedAgents > 0 ? "websocket_agent_connected" : "worker_online_atlas_offline",
    mode: localBridgeOnline ? "live" : "relay_only",
    atlas_responder_available: Boolean(agentStatus.atlas_responder_available),
    simple_tools_available: agentStatus.simple_tools_available !== false,
    rag_available: Boolean(agentStatus.rag_available),
    search_available: Boolean(agentStatus.search_available),
  };
}

function answerSimpleTool(text) {
  const lowered = String(text || "").toLowerCase();
  if (!lowered.trim()) return null;
  if (/\b(time|current time|right now)\b/.test(lowered)) {
    for (const [key, location, timezone, abbreviation] of SIMPLE_TIMEZONES) {
      if (wordMatch(lowered, key)) {
        return { intent: "timezone_time", reply_text: simpleTimeReply(location, timezone, abbreviation), used_tools: ["worker_simple_time_tool"] };
      }
    }
    return { intent: "time_now", reply_text: simpleTimeReply("UTC", "UTC", "UTC"), used_tools: ["worker_simple_time_tool"] };
  }
  if (/\b(date|what day|today)\b/.test(lowered)) {
    const date = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
    return { intent: "date_now", reply_text: `Today is ${date} in UTC.`, used_tools: ["worker_simple_date_tool"] };
  }
  if (/\b(what can atlas do|what do you do|what services|atlas do|help with)\b/.test(lowered)) {
    return {
      intent: "what_can_atlas_do",
      reply_text: "AtlasOps AI helps with AI automation audits, AI website visibility audits, lead follow-up systems, source-backed content workflows, SWOT reports, code/spec-driven reviews, OCR/document workflows, and AI tool training. Start with your goal, current tools, and the slowest part of the workflow.",
      used_tools: ["worker_service_faq"],
    };
  }
  if (/\b(start an audit|start audit|how do i start|begin an audit)\b/.test(lowered)) {
    return {
      intent: "start_audit",
      reply_text: "To start an audit, ask Atlas what you want improved and include a public-safe website URL if relevant. Atlas can recommend the first service lane and draft the next intake questions. Do not send passwords, API keys, payment card data, or private customer files in public chat.",
      used_tools: ["worker_start_audit_faq"],
    };
  }
  if (/\b(pay|card|credit card|checkout|price|cost|how much)\b/.test(lowered)) {
    return {
      intent: "payment_link",
      reply_text: "Yes. AtlasOps can accept card payments through the Cloud9 secure checkout path when the gateway is enabled. You can start with the AI Website SEO + AI Visibility Audit for $199. Atlas will create an order, send you to secure checkout, and begin intake after payment is verified. No private website access is required to start. Card checkout is being configured now, so Atlas can still create the order and provide the current start path.",
      used_tools: ["worker_payment_faq"],
    };
  }
  return null;
}

export class AtlasChatRoom {
  constructor(state) {
    this.state = state;
    this.visitors = new Map();
    this.agents = new Set();
  }

  async get(key, fallback) {
    return (await this.state.storage.get(key)) || fallback;
  }

  async put(key, value) {
    await this.state.storage.put(key, value);
    return value;
  }

  async append(key, value, limit = MAX_MESSAGES) {
    const items = await this.get(key, []);
    items.push(value);
    await this.put(key, trim(items, limit));
    return value;
  }

  async updateSession(message) {
    const sessions = await this.get("sessions", {});
    const current = sessions[message.session_id] || {
      session_id: message.session_id,
      created_at: now(),
      status: "waiting_for_atlas",
    };
    sessions[message.session_id] = {
      ...current,
      email: message.email || current.email || null,
      name: message.name || current.name || null,
      company: message.company || current.company || null,
      service_interest: message.service_interest || current.service_interest || null,
      last_seen: now(),
      last_message_at: message.created_at || now(),
      status: message.role === "atlas" ? "reply_available" : "waiting_for_atlas",
      page_path: message.page_path || current.page_path || "/",
    };
    const entries = Object.values(sessions)
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .slice(-MAX_SESSIONS);
    await this.put("sessions", Object.fromEntries(entries.map((item) => [item.session_id, item])));
    return sessions[message.session_id];
  }

  async summary() {
    const messages = await this.get("messages", []);
    const replies = await this.get("replies", []);
    const sessions = await this.get("sessions", {});
    const agentStatus = await this.get("agent_status", { status: this.agents.size ? "live_online" : "offline", updated_at: null, simple_tools_available: true });
    const bridge = bridgeSnapshot(agentStatus, this.agents.size);
    const activeSince = Date.now() - ACTIVE_WINDOW_MS;
    const activeSessions = Object.values(sessions).filter((item) => Date.parse(item.last_seen || 0) >= activeSince);
    return {
      ok: true,
      site_id: SITE_ID,
      worker: "atlasops-live-chat",
      durable_object: "AtlasChatSession",
      bridge_status: bridge.bridge_status,
      local_bridge_online: bridge.local_bridge_online,
      last_bridge_heartbeat_at: bridge.last_bridge_heartbeat_at,
      atlas_responder_available: bridge.atlas_responder_available,
      simple_tools_available: bridge.simple_tools_available,
      rag_available: bridge.rag_available,
      search_available: bridge.search_available,
      mode: bridge.mode,
      active_sessions: activeSessions.length,
      total_sessions: Object.keys(sessions).length,
      message_count: messages.length,
      reply_count: replies.length,
      latest_messages: messages.slice(-30),
      latest_replies: replies.slice(-30),
      agent_status: agentStatus,
      updated_at: now(),
    };
  }

  async healthPayload() {
    const agentStatus = await this.get("agent_status", { status: this.agents.size ? "live_online" : "offline", updated_at: null, simple_tools_available: true });
    const bridge = bridgeSnapshot(agentStatus, this.agents.size);
    return {
      ok: true,
      site_id: SITE_ID,
      worker: "online",
      durable_object: "configured",
      websocket: true,
      fallback_polling: true,
      local_bridge_online: bridge.local_bridge_online,
      last_bridge_heartbeat_at: bridge.last_bridge_heartbeat_at,
      atlas_responder_available: bridge.atlas_responder_available,
      simple_tools_available: true,
      rag_available: bridge.rag_available,
      search_available: bridge.search_available,
      mode: bridge.mode,
      updated_at: now(),
    };
  }

  broadcast(payload, target = "all") {
    const data = JSON.stringify(payload);
    if (target === "agents" || target === "all") {
      [...this.agents].forEach((socket) => {
        try { socket.send(data); } catch { this.agents.delete(socket); }
      });
    }
    if (target === "visitors" || target === "all") {
      [...this.visitors.values()].flat().forEach((socket) => {
        try { socket.send(data); } catch {}
      });
    }
  }

  acceptVisitorSocket(request, sessionId) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const existing = this.visitors.get(sessionId) || [];
    existing.push(server);
    this.visitors.set(sessionId, existing);
    server.send(JSON.stringify({ type: "status", status: this.agents.size ? "live_online" : "waiting_for_atlas", session_id: sessionId, created_at: now() }));
    server.addEventListener("message", async (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data || "{}"); } catch { payload = { text: String(event.data || "") }; }
      const message = normalizeMessage(payload, { session_id: sessionId, role: "visitor" });
      if (!message.text) return;
      await this.append("messages", message);
      await this.updateSession(message);
      this.broadcast({ type: "visitor_message", message }, "agents");
      server.send(JSON.stringify({ type: "ack", message_id: message.message_id, status: this.agents.size ? "sent_to_atlas" : "queued", created_at: now() }));
    });
    server.addEventListener("close", () => {
      const sockets = (this.visitors.get(sessionId) || []).filter((socket) => socket !== server);
      if (sockets.length) this.visitors.set(sessionId, sockets);
      else this.visitors.delete(sessionId);
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  acceptAgentSocket() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.agents.add(server);
    server.send(JSON.stringify({ type: "status", status: "agent_connected", created_at: now() }));
    server.addEventListener("message", async (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data || "{}"); } catch { payload = {}; }
      if (payload.type !== "agent_reply") return;
      const reply = normalizeMessage({ ...payload, role: "atlas", status: "reply_available" }, { role: "atlas" });
      if (!reply.session_id || !reply.text) return;
      await this.append("messages", reply);
      await this.append("replies", reply);
      await this.updateSession(reply);
      (this.visitors.get(reply.session_id) || []).forEach((socket) => {
        try { socket.send(JSON.stringify({ type: "atlas_reply", message: reply })); } catch {}
      });
      server.send(JSON.stringify({ type: "ack", message_id: reply.message_id, status: "reply_available", created_at: now() }));
    });
    server.addEventListener("close", () => this.agents.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/chat/ws" && request.headers.get("upgrade") === "websocket") {
      const sessionId = url.searchParams.get("session_id") || uuid("session");
      return this.acceptVisitorSocket(request, sessionId);
    }
    if (path === "/admin/agent/ws" && request.headers.get("upgrade") === "websocket") {
      return this.acceptAgentSocket();
    }
    if (path === "/health" && request.method === "GET") return json(await this.healthPayload());
    if ((path === "/chat/message" || path === "/ask") && request.method === "POST") {
      const payload = await readJson(request);
      if (payload.website_confirm) return json({ ok: false, status: "blocked", error: "honeypot_triggered" }, { status: 400 });
      const message = normalizeMessage(payload, { role: "visitor" });
      if (!message.text) return json({ ok: false, error: "message_text_required" }, { status: 400 });
      await this.append("messages", message);
      await this.updateSession(message);
      this.broadcast({ type: "visitor_message", message }, "agents");
      const agentStatus = await this.get("agent_status", { status: this.agents.size ? "live_online" : "offline", updated_at: null, simple_tools_available: true });
      const bridge = bridgeSnapshot(agentStatus, this.agents.size);
      const simple = answerSimpleTool(message.text);
      if (simple) {
        const reply = normalizeMessage({
          session_id: message.session_id,
          message_id: message.message_id,
          role: "atlas",
          text: simple.reply_text,
          status: "reply_available",
          non_production_sample: message.non_production_sample,
          service_interest: message.service_interest,
          page_path: message.page_path,
        }, { role: "atlas" });
        reply.answered_by = "worker_simple_tool";
        reply.route = "simple_tool";
        reply.intent = simple.intent;
        reply.used_tools = simple.used_tools;
        await this.append("messages", reply);
        await this.append("replies", reply);
        await this.updateSession(reply);
        (this.visitors.get(reply.session_id) || []).forEach((socket) => {
          try { socket.send(JSON.stringify({ type: "atlas_reply", message: reply })); } catch {}
        });
        return json({
          ok: true,
          status: "reply_available",
          message_id: message.message_id,
          session_id: message.session_id,
          question_id: message.message_id,
          bridge_status: bridge.local_bridge_online ? "sent_to_atlas" : "worker_simple_tool",
          local_bridge_online: bridge.local_bridge_online,
          answered_by: "worker_simple_tool",
          route: "simple_tool",
          reply,
          note: "Worker simple tools answered a deterministic public question; local Atlas can still ingest the event later."
        });
      }
      return json({
        ok: true,
        status: bridge.local_bridge_online || this.agents.size ? "sent_to_atlas" : "queued",
        bridge_status: bridge.bridge_status,
        local_bridge_online: bridge.local_bridge_online,
        message_id: message.message_id,
        session_id: message.session_id,
        question_id: message.message_id
      });
    }
    if (path.startsWith("/chat/session/") && request.method === "GET") {
      const sessionId = decodeURIComponent(path.slice("/chat/session/".length));
      const messages = (await this.get("messages", [])).filter((item) => item.session_id === sessionId);
      const replies = (await this.get("replies", [])).filter((item) => item.session_id === sessionId);
      const sessions = await this.get("sessions", {});
      return json({ ok: true, session: sessions[sessionId] || null, messages, replies });
    }
    if ((path.startsWith("/chat/reply/") || path.startsWith("/reply/")) && request.method === "GET") {
      const prefix = path.startsWith("/chat/reply/") ? "/chat/reply/" : "/reply/";
      const lookupId = decodeURIComponent(path.slice(prefix.length));
      const replies = (await this.get("replies", [])).filter((item) => item.message_id === lookupId || item.session_id === lookupId);
      return json(replies.length ? { ok: true, status: "reply_available", replies } : { ok: true, status: "pending", replies: [] });
    }
    if (path === "/event" || path === "/heartbeat" || path === "/go-click" || path === "/lead") {
      const payload = request.method === "POST" ? await readJson(request) : {};
      await this.append(path.slice(1) || "event", { ...payload, received_at: now() }, 300);
      return json({ ok: true, status: "received" });
    }
    if (path === "/admin/summary" && request.method === "GET") return json(await this.summary());
    if (path === "/admin/sessions" && request.method === "GET") return json({ ok: true, sessions: await this.get("sessions", {}) });
    if (path === "/admin/messages" && request.method === "GET") return json({ ok: true, messages: await this.get("messages", []) });
    if (path === "/admin/agent/status" && request.method === "POST") {
      const payload = await readJson(request);
      const status = {
        status: payload.status || (payload.local_bridge_online ? "live_online" : this.agents.size ? "live_online" : "offline"),
        mode: payload.mode || "outbound_bridge",
        local_bridge_online: Boolean(payload.local_bridge_online),
        atlas_responder_available: Boolean(payload.atlas_responder_available),
        simple_tools_available: payload.simple_tools_available !== false,
        rag_available: Boolean(payload.rag_available),
        search_available: Boolean(payload.search_available),
        timestamp: payload.timestamp || now(),
        updated_at: now(),
      };
      await this.put("agent_status", status);
      return json({ ok: true, agent_status: status });
    }
    if (path === "/admin/agent/reply" && request.method === "POST") {
      const payload = await readJson(request);
      const reply = normalizeMessage({ ...payload, text: payload.reply_text || payload.text, role: "atlas", status: "reply_available" }, { role: "atlas" });
      if (!reply.session_id || !reply.text) return json({ ok: false, error: "session_id_and_reply_text_required" }, { status: 400 });
      await this.append("messages", reply);
      await this.append("replies", reply);
      await this.updateSession(reply);
      (this.visitors.get(reply.session_id) || []).forEach((socket) => {
        try { socket.send(JSON.stringify({ type: "atlas_reply", message: reply })); } catch {}
      });
      return json({ ok: true, status: "reply_available", reply });
    }
    if (path === "/admin/ack" && request.method === "POST") return json({ ok: true, acked_at: now() });
    if (path === "/admin/clear-test-data" && request.method === "POST") {
      await this.put("messages", []);
      await this.put("replies", []);
      await this.put("sessions", {});
      await this.put("event", []);
      await this.put("heartbeat", []);
      await this.put("go-click", []);
      await this.put("lead", []);
      return json({ ok: true, cleared_at: now() });
    }
    return json({ ok: false, error: "not_found" }, { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204, headers: corsHeaders(request, env) }), env);
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/health" && request.method === "GET") {
        if (env.ATLAS_CHAT_ROOM) return withCors(request, await forwardToRoom(request, env, "/health"), env);
        return withCors(request, json({
          ok: true,
          site_id: SITE_ID,
          worker: "online",
          durable_object: "setup_required",
          websocket: true,
          fallback_polling: true,
          local_bridge_online: false,
          last_bridge_heartbeat_at: null,
          simple_tools_available: true,
          mode: "relay_only",
        }), env);
      }
      if (path.startsWith("/admin/")) {
        if (!adminAllowed(request, env)) return json({ ok: false, error: "admin_secret_required" }, { status: 401 });
        const adminBody = request.method === "GET" || request.headers.get("upgrade") === "websocket"
          ? undefined
          : await request.text();
        return await forwardToRoom(request, env, path, adminBody);
      }
      const body = request.method === "GET" || request.headers.get("upgrade") === "websocket" ? undefined : await request.text();
      return withCors(request, await forwardToRoom(request, env, path, body), env);
    } catch (error) {
      return withCors(request, json({ ok: false, error: "worker_error", detail: String(error && error.message ? error.message : error) }, { status: 500 }), env);
    }
  },
};

export class AtlasChatSession extends AtlasChatRoom {}

