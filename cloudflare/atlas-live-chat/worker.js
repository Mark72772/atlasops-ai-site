const SITE_ID = "atlasops-ai";
const ACTIVE_WINDOW_MS = 120000;
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
    synthetic_test: Boolean(payload.synthetic_test || payload.is_test),
  };
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
    const activeSince = Date.now() - ACTIVE_WINDOW_MS;
    const activeSessions = Object.values(sessions).filter((item) => Date.parse(item.last_seen || 0) >= activeSince);
    return {
      ok: true,
      site_id: SITE_ID,
      worker: "atlasops-live-chat",
      durable_object: "AtlasChatRoom",
      bridge_status: this.agents.size > 0 ? "live_online" : "worker_online_atlas_offline",
      active_sessions: activeSessions.length,
      total_sessions: Object.keys(sessions).length,
      message_count: messages.length,
      reply_count: replies.length,
      latest_messages: messages.slice(-30),
      latest_replies: replies.slice(-30),
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
    if ((path === "/chat/message" || path === "/ask") && request.method === "POST") {
      const payload = await readJson(request);
      if (payload.website_confirm) return json({ ok: false, status: "blocked", error: "honeypot_triggered" }, { status: 400 });
      const message = normalizeMessage(payload, { role: "visitor" });
      if (!message.text) return json({ ok: false, error: "message_text_required" }, { status: 400 });
      await this.append("messages", message);
      await this.updateSession(message);
      this.broadcast({ type: "visitor_message", message }, "agents");
      return json({
        ok: true,
        status: this.agents.size ? "sent_to_atlas" : "queued",
        message_id: message.message_id,
        session_id: message.session_id,
        question_id: message.session_id
      });
    }
    if ((path.startsWith("/chat/reply/") || path.startsWith("/reply/")) && request.method === "GET") {
      const prefix = path.startsWith("/chat/reply/") ? "/chat/reply/" : "/reply/";
      const sessionId = decodeURIComponent(path.slice(prefix.length));
      const replies = (await this.get("replies", [])).filter((item) => item.session_id === sessionId);
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
        return withCors(request, json({
          ok: true,
          site_id: SITE_ID,
          worker: "atlasops-live-chat",
          durable_object: env.ATLAS_CHAT_ROOM ? "configured" : "setup_required",
          websocket: true,
          fallback_polling: true,
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
