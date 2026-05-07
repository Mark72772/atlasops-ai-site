const SITE_ID = "atlasops-ai";
const ACTIVE_WINDOW_MS = 120000;
const MAX_ITEMS = 500;
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

function trim(items) {
  return items.slice(Math.max(0, items.length - MAX_ITEMS));
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
    "access-control-allow-headers": "content-type",
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
  if (!env.ATLAS_LIVEOPS_ROOM) return null;
  return env.ATLAS_LIVEOPS_ROOM.get(env.ATLAS_LIVEOPS_ROOM.idFromName(SITE_ID));
}

async function forwardToRoom(request, env, path, payload = null) {
  const target = room(env);
  if (!target) {
    return json({
      ok: false,
      status: "needs_setup",
      error: "durable_object_binding_missing",
      next_step: "Bind ATLAS_LIVEOPS_ROOM in wrangler.toml and deploy again.",
    }, { status: 503 });
  }
  const url = new URL(request.url);
  url.pathname = path;
  return target.fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: payload ? JSON.stringify(payload) : request.method === "GET" ? undefined : await request.text(),
  });
}

export class AtlasLiveOpsRoom {
  constructor(state) {
    this.state = state;
  }

  async get(key, fallback) {
    return (await this.state.storage.get(key)) || fallback;
  }

  async put(key, value) {
    await this.state.storage.put(key, value);
    return value;
  }

  async append(key, value) {
    const items = await this.get(key, []);
    items.push(value);
    await this.put(key, trim(items));
    return value;
  }

  async summary() {
    const events = await this.get("events", []);
    const leads = await this.get("leads", []);
    const questions = await this.get("questions", []);
    const sessions = await this.get("sessions", {});
    const replies = await this.get("replies", {});
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const activeSince = Date.now() - ACTIVE_WINDOW_MS;
    const recent = (item) => Date.parse(item.received_at || item.created_at || item.timestamp || 0) >= since;
    const activeVisitors = Object.values(sessions).filter((item) => Date.parse(item.last_seen || 0) >= activeSince).length;
    return {
      ok: true,
      site_id: SITE_ID,
      active_visitors: activeVisitors,
      page_views_24h: events.filter((item) => item.event_type === "page_view" && recent(item)).length,
      go_clicks_24h: events.filter((item) => item.event_type === "go_click" && recent(item)).length,
      leads_24h: leads.filter(recent).length,
      ask_atlas_questions_24h: questions.filter(recent).length,
      open_questions: questions.filter((item) => !["reply_posted", "emailed", "blocked"].includes(item.status)).length,
      latest_events: events.slice(-20),
      latest_leads: leads.slice(-20),
      latest_questions: questions.slice(-20),
      reply_count: Object.keys(replies).length,
      updated_at: now(),
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/event" && request.method === "POST") {
      const payload = await readJson(request);
      const event = {
        event_id: payload.event_id || uuid("evt"),
        event_type: payload.event_type || "event",
        site_id: payload.site_id || SITE_ID,
        anonymous_session_id: payload.anonymous_session_id || payload.session_id || uuid("session"),
        page_path: payload.page_path || payload.path || "/",
        page_title: payload.page_title || "",
        referrer: payload.referrer || null,
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null,
        utm_content: payload.utm_content || null,
        go_route: payload.go_route || null,
        service_interest: payload.service_interest || null,
        timestamp: payload.timestamp || now(),
        source: "github_pages",
        synthetic_test: Boolean(payload.synthetic_test),
        received_at: now(),
      };
      await this.append("events", event);
      if (event.event_type === "heartbeat" || event.event_type === "page_view") {
        const sessions = await this.get("sessions", {});
        sessions[event.anonymous_session_id] = { session_id: event.anonymous_session_id, last_seen: now(), path: event.page_path };
        await this.put("sessions", sessions);
      }
      return json({ ok: true, event_id: event.event_id });
    }
    if (path === "/lead" && request.method === "POST") {
      const payload = await readJson(request);
      const lead = { ...payload, lead_event_id: payload.lead_event_id || uuid("lead"), status: "new", received_at: now() };
      await this.append("leads", lead);
      return json({ ok: true, lead_event_id: lead.lead_event_id });
    }
    if (path === "/ask" && request.method === "POST") {
      const payload = await readJson(request);
      if (!payload.email || !payload.question) return json({ ok: false, error: "email_and_question_required" }, { status: 400 });
      const question = {
        question_id: payload.question_id || uuid("q"),
        anonymous_session_id: payload.anonymous_session_id || uuid("session"),
        name: payload.name || null,
        email: payload.email,
        company: payload.company || null,
        website: payload.website || null,
        service_interest: payload.service_interest || null,
        question: payload.question,
        source_page: payload.source_page || payload.page_path || "/ask-atlas.html",
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null,
        status: "new",
        synthetic_test: Boolean(payload.synthetic_test),
        created_at: now(),
        received_at: now(),
      };
      await this.append("questions", question);
      return json({ ok: true, question_id: question.question_id, status: "queued" });
    }
    if (path.startsWith("/reply/") && request.method === "GET") {
      const id = decodeURIComponent(path.slice("/reply/".length));
      const replies = await this.get("replies", {});
      return json(replies[id] ? { ok: true, status: "reply_available", reply: replies[id] } : { ok: true, status: "pending" });
    }
    if (path === "/admin/summary" && request.method === "GET") return json(await this.summary());
    if (path === "/admin/events" && request.method === "GET") return json({ ok: true, events: await this.get("events", []) });
    if (path === "/admin/leads" && request.method === "GET") return json({ ok: true, leads: await this.get("leads", []) });
    if (path === "/admin/questions" && request.method === "GET") return json({ ok: true, questions: await this.get("questions", []) });
    if (path === "/admin/reply" && request.method === "POST") {
      const payload = await readJson(request);
      if (!payload.question_id || !payload.reply_text) return json({ ok: false, error: "question_id_and_reply_text_required" }, { status: 400 });
      const replies = await this.get("replies", {});
      replies[payload.question_id] = {
        reply_id: payload.reply_id || uuid("reply"),
        question_id: payload.question_id,
        reply_text: payload.reply_text,
        status: "reply_posted",
        posted_at: now(),
        synthetic_test: Boolean(payload.synthetic_test),
      };
      await this.put("replies", replies);
      return json({ ok: true, reply_id: replies[payload.question_id].reply_id });
    }
    if (path === "/admin/ack" && request.method === "POST") return json({ ok: true, acked_at: now() });
    if (path === "/admin/clear-test-data" && request.method === "POST") {
      await this.put("events", []);
      await this.put("leads", []);
      await this.put("questions", []);
      await this.put("sessions", {});
      await this.put("replies", {});
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
        return withCors(request, json({ ok: true, site_id: SITE_ID, storage: env.ATLAS_LIVEOPS_ROOM ? "durable_object" : "needs_setup" }), env);
      }
      if (["/event", "/heartbeat", "/go-click", "/lead", "/ask"].includes(path) && request.method === "POST") {
        const payload = await readJson(request);
        if (payload.website_confirm) {
          return withCors(request, json({ ok: false, status: "blocked", error: "honeypot_triggered" }, { status: 400 }), env);
        }
        const route = path === "/heartbeat" ? "/event" : path === "/go-click" ? "/event" : path;
        const normalized = {
          ...payload,
          site_id: payload.site_id || SITE_ID,
          event_type: path === "/heartbeat" ? "heartbeat" : path === "/go-click" ? "go_click" : payload.event_type,
          received_at: now(),
        };
        return withCors(request, await forwardToRoom(request, env, route, normalized), env);
      }
      if (path.startsWith("/reply/") && request.method === "GET") {
        return withCors(request, await forwardToRoom(request, env, path), env);
      }
      if (path.startsWith("/admin/")) {
        if (!adminAllowed(request, env)) {
          return json({ ok: false, error: "admin_secret_required" }, { status: 401 });
        }
        return await forwardToRoom(request, env, path);
      }
      return withCors(request, json({ ok: false, error: "not_found" }, { status: 404 }), env);
    } catch (error) {
      return withCors(request, json({ ok: false, error: "worker_error", detail: String(error && error.message ? error.message : error) }, { status: 500 }), env);
    }
  },
};
