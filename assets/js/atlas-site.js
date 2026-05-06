const atlasEndpointConfig = {
  provider: "none",
  endpointUrl: "",
  status: "endpoint_needs_setup",
};

const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
const query = new URLSearchParams(window.location.search);
const storedContext = JSON.parse(localStorage.getItem("atlasops_utm_context") || "{}");
const context = { ...storedContext };
utmKeys.forEach((key) => {
  const value = query.get(key);
  if (value) context[key] = value.slice(0, 160);
});
context.referrer = context.referrer || document.referrer || "";
context.source_page = window.location.pathname;
if (window.location.pathname.includes("/go/")) {
  context.go_route = window.location.pathname;
}
localStorage.setItem("atlasops_utm_context", JSON.stringify(context));

const sessionKey = "atlasops_public_session_id";
const sessionId = sessionStorage.getItem(sessionKey) || crypto.randomUUID();
sessionStorage.setItem(sessionKey, sessionId);

function publicEvent(type, detail = {}) {
  const event = {
    type,
    session_id: sessionId,
    path: window.location.pathname,
    timestamp: new Date().toISOString(),
    utm_source: context.utm_source || "",
    utm_medium: context.utm_medium || "",
    utm_campaign: context.utm_campaign || "",
    detail,
  };
  const events = JSON.parse(sessionStorage.getItem("atlasops_public_events") || "[]");
  events.push(event);
  sessionStorage.setItem("atlasops_public_events", JSON.stringify(events.slice(-50)));
  return event;
}

publicEvent("page_view");
setTimeout(() => publicEvent("heartbeat", { seconds: 10 }), 10000);

function fillHiddenFields(form) {
  [...form.querySelectorAll('input[type="hidden"]')].forEach((field) => {
    if (field.name === "source_page") field.value = window.location.pathname;
    else if (field.name === "referrer") field.value = context.referrer || "";
    else if (field.name === "go_route") field.value = context.go_route || "";
    else if (context[field.name]) field.value = context[field.name];
  });
}

function setupNotice(form, note) {
  const message = "Endpoint setup needed. AtlasOps can still answer by async email after Formspree, Google Apps Script, Cloudflare Worker, or mailto fallback is configured.";
  const submit = form.querySelector('[type="submit"]');
  form.dataset.endpointStatus = atlasEndpointConfig.status;
  form.dataset.endpointType = atlasEndpointConfig.provider;
  if (submit && atlasEndpointConfig.status !== "ready") {
    submit.textContent = "Endpoint setup needed";
    submit.setAttribute("aria-describedby", "lead-form-setup-required");
  }
  if (note) {
    note.classList.add("warning");
    note.textContent = message;
  }
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitLeadForm(form, note) {
  const honeypot = form.querySelector('[name="website_confirm"]');
  if (honeypot && honeypot.value) return { ok: false, blocked: true };
  if (atlasEndpointConfig.status !== "ready" || !atlasEndpointConfig.endpointUrl) {
    setupNotice(form, note);
    return { ok: false, status: "endpoint_needs_setup" };
  }
  const response = await fetch(atlasEndpointConfig.endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formPayload(form)),
  });
  return { ok: response.ok, status: response.ok ? "submitted" : "failed" };
}

document.querySelectorAll(".atlasops-lead-form").forEach((form) => {
  fillHiddenFields(form);
  const note = form.querySelector(".form-note");
  if (atlasEndpointConfig.status !== "ready") setupNotice(form, note);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    publicEvent(form.classList.contains("ask-atlas-widget-form") ? "ask_atlas_submit" : "lead_submit", { status: atlasEndpointConfig.status });
    const result = await submitLeadForm(form, note);
    if (note) {
      note.classList.toggle("warning", !result.ok);
      note.textContent = result.ok
        ? "Thanks - AtlasOps received your question. Atlas will review it and reply by email."
        : "Endpoint setup needed. Your question was not sent yet. Use PayPal or the contact instructions while AtlasOps connects the intake endpoint.";
    }
  });
});

document.querySelectorAll("[data-go-route], .button.gold").forEach((link) => {
  link.addEventListener("click", () => publicEvent("go_click", { href: link.getAttribute("href") || "" }));
});

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
