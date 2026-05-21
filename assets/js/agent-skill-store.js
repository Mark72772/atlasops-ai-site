(function () {
  const FALLBACK_BUNDLES = [
    {
      pack_id: "agent-builder-starter-bundle",
      name: "Agent Builder Starter Bundle",
      price: 249,
      included_packs: [
        "Agent Context Intelligence Guardrail",
        "Codex Repo Control Guardrail",
        "Git Deploy Safety Guardrail"
      ],
      pain_point: "Context, repo boundaries, and deploy safety for builders letting agents touch code."
    },
    {
      pack_id: "social-publisher-safety-bundle",
      name: "Social Publisher Safety Bundle",
      price: 249,
      included_packs: [
        "Social Publishing Guardrail",
        "RAG Source Packet Guardrail",
        "AI SEO Visibility Guardrail"
      ],
      pain_point: "Source-backed social workflows that block stale drafts and false publish claims."
    },
    {
      pack_id: "revenue-agent-bundle",
      name: "Revenue Agent Bundle",
      price: 299,
      included_packs: [
        "Stripe Payment Proof Guardrail",
        "SaaS Operator Guardrail",
        "Agent Daily Operations Guardrail"
      ],
      pain_point: "Stripe proof, SaaS operator checks, and daily revenue-agent routines."
    },
    {
      pack_id: "openclaw-codex-integration-bundle",
      name: "OpenClaw + Codex Integration Bundle",
      price: 299,
      included_packs: [
        "OpenClaw Integration Guardrail",
        "Codex Repo Control Guardrail",
        "Agent Context Intelligence Guardrail"
      ],
      pain_point: "Doctor checks, gateway proof, repo controls, and context boundaries."
    },
    {
      pack_id: "agent-company-launch-kit",
      name: "Agent Company Launch Kit",
      price: 499,
      included_packs: [
        "Agent Company Template",
        "Setup review checklist",
        "QA acceptance contract",
        "Routines + budgets + tickets"
      ],
      pain_point: "A company-level operating layer for agent teams with roles, tickets, routines, and QA."
    }
  ];

  const PRODUCTS = {
    codex: {
      kit: "Codex Repo Control Guardrail",
      pack_id: "codex-repo-control-guardrail",
      bundle: "Agent Builder Starter Bundle",
      bundle_id: "agent-builder-starter-bundle",
      blocks: "unbounded patches, unrelated dirty-file commits, and unverified test claims"
    },
    social: {
      kit: "Social Publishing Guardrail",
      pack_id: "social-publishing-guardrail",
      bundle: "Social Publisher Safety Bundle",
      bundle_id: "social-publisher-safety-bundle",
      blocks: "empty composer attempts, stale drafts, debug labels, and false publish proof"
    },
    rag: {
      kit: "RAG Source Packet Guardrail",
      pack_id: "rag-source-packet-guardrail",
      bundle: "Social Publisher Safety Bundle",
      bundle_id: "social-publisher-safety-bundle",
      blocks: "unsupported claims, stale sources, and citation gaps"
    },
    stripe: {
      kit: "Stripe Payment Proof Guardrail",
      pack_id: "stripe-payment-proof-guardrail",
      bundle: "Revenue Agent Bundle",
      bundle_id: "revenue-agent-bundle",
      blocks: "checkout URLs, payment links, or success redirects being counted as paid"
    },
    openclaw: {
      kit: "OpenClaw Integration Guardrail",
      pack_id: "openclaw-integration-guardrail",
      bundle: "OpenClaw + Codex Integration Bundle",
      bundle_id: "openclaw-codex-integration-bundle",
      blocks: "skipped doctor checks, missing rollback proof, and unsafe tool bridge changes"
    },
    company: {
      kit: "Agent Daily Operations Guardrail",
      pack_id: "agent-daily-operations-guardrail",
      bundle: "Agent Company Launch Kit",
      bundle_id: "agent-company-launch-kit",
      blocks: "heartbeat-only work, ownerless tickets, missing routines, and weak QA acceptance"
    }
  };

  function cfg() {
    return window.ATLAS_STRIPE_CHECKOUT_CONFIG || window.ATLAS_PAYMENTS_CONFIG || {};
  }

  function isCheckoutLive() {
    const config = cfg();
    return Boolean(config.workerUrl) && String(config.mode || "").toLowerCase() === "live";
  }

  function dataPath(file) {
    const prefix = location.pathname.includes("/guardrails/") ? "../" : "";
    return `${prefix}data/${file}`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function updatePositioningCopy() {
    const guardrailHero = document.querySelector(".gr-hero");
    if (guardrailHero) {
      const title = guardrailHero.querySelector("h1");
      const subtitle = guardrailHero.querySelector(".gr-subtitle");
      const body = guardrailHero.querySelector(".gr-body");
      if (title) title.textContent = "Agent Skill Packs + Operational Guardrails";
      if (subtitle) subtitle.textContent = "Guardrails, not prompts.";
      if (body) {
        body.textContent = "Reusable workflow controls for Codex, Claude Code, OpenClaw, RAG, Stripe, social publishing, SaaS operators, and AI business agents. These are operational infrastructure: checks, blockers, evidence rules, SKILL.md files, AGENTS.md files, QA contracts, and delivery policies.";
      }
      const firstAction = guardrailHero.querySelector(".gr-primary");
      if (firstAction) firstAction.textContent = "Browse $99 Agent Skill Packs";
    }

    const homeHero = document.querySelector(".hero.compact-hero h1");
    if (homeHero && /Operational Guardrails/.test(homeHero.textContent || "")) {
      homeHero.textContent = "Agent Skill Packs + Operational Guardrails";
      const lead = document.querySelector(".hero.compact-hero .lead");
      if (lead) lead.textContent = "Guardrails, not prompts.";
    }
  }

  function checkoutNote() {
    return isCheckoutLive()
      ? "Stripe Checkout live. Delivery unlocks after verified Stripe payment evidence."
      : "Stripe Checkout is temporarily unavailable. Ask Atlas for setup review.";
  }

  function bundleCard(bundle, cardClass) {
    const included = (bundle.included_packs || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return `<article class="${cardClass}">
      <span class="tag">Bundle</span>
      <h3>${escapeHtml(bundle.name)}</h3>
      <p>${escapeHtml(bundle.pain_point)}</p>
      <p class="price">$${escapeHtml(bundle.price)}</p>
      <ul class="mini-list">${included}</ul>
      <button type="button" data-router-buy="${escapeHtml(bundle.pack_id)}" data-product-type="agent_skill_bundle" data-price="${escapeHtml(bundle.price)}">${isCheckoutLive() ? "Buy Bundle" : "Ask Atlas about this bundle"}</button>
      <p class="checkout-note">${checkoutNote()}</p>
    </article>`;
  }

  async function loadBundles() {
    try {
      const response = await fetch(dataPath("agent-skill-bundles.json"), { cache: "no-store" });
      const data = await response.json();
      return data.bundles || FALLBACK_BUNDLES;
    } catch (error) {
      return FALLBACK_BUNDLES;
    }
  }

  async function insertBundles() {
    if (document.getElementById("agent-skill-bundles")) return;
    const bundles = await loadBundles();
    const isGuardrailPage = Boolean(document.querySelector(".gr-shell"));
    const section = document.createElement("section");
    section.id = "agent-skill-bundles";
    section.className = isGuardrailPage ? "skill-store-panel" : "section white tight skill-store-panel";
    section.innerHTML = `
      <div class="section-head skill-store-head">
        <h2>Bundle the controls buyers usually need together.</h2>
        <p class="lead">Agent Skill Bundles combine the $99 packs into complete operating paths for builders, social publishers, revenue agents, OpenClaw + Codex workflows, and Agent Company launches.</p>
      </div>
      <div class="${isGuardrailPage ? "bundle-grid" : "grid offer-grid"}">
        ${bundles.map((bundle) => bundleCard(bundle, isGuardrailPage ? "gr-card bundle-card" : "card bundle-card")).join("")}
      </div>`;
    const anchor = document.querySelector(".gr-anchor-nav") || document.getElementById("featured") || document.getElementById("tool-packs");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
  }

  function chooseRoute(text, platform) {
    const q = `${text} ${platform}`.toLowerCase();
    if (/(linkedin|social|composer|post|publish)/.test(q) || /(^|\s)x(\s|$)/.test(q)) return PRODUCTS.social;
    if (/(rag|source|citation|unsupported|claims|hallucination)/.test(q)) return PRODUCTS.rag;
    if (/(stripe|payment|download|checkout|revenue|paid|webhook)/.test(q)) return PRODUCTS.stripe;
    if (/(openclaw|gateway|doctor|plugin|tool bridge)/.test(q)) return PRODUCTS.openclaw;
    if (/(company|template|routine|ticket|budget|qa|launch)/.test(q)) return PRODUCTS.company;
    return PRODUCTS.codex;
  }

  function routerMarkup(isGuardrailPage) {
    return `<section id="ask-atlas-product-router" class="${isGuardrailPage ? "skill-router-panel" : "section white tight skill-router-panel"}">
      <div class="section-head skill-store-head">
        <h2>Ask Atlas which pack fits my workflow</h2>
        <p class="lead">Describe the failure mode. Atlas recommends an Agent Skill Pack, a bundle, and the proof rule it protects.</p>
      </div>
      <form class="router-form" data-agent-skill-router>
        <label>Workflow pain point<textarea name="pain_point" rows="4" placeholder="Example: My Codex agent keeps changing too many files."></textarea></label>
        <label>Tool platform<select name="platform"><option>Codex</option><option>Claude Code</option><option>OpenClaw</option><option>RAG</option><option>Stripe</option><option>Social</option><option>SaaS</option><option>Other</option></select></label>
        <label>Budget<select name="budget"><option>$99 pack</option><option>$249-$299 bundle</option><option>$499 launch kit</option><option>Setup review</option></select></label>
        <label>Urgency<select name="urgency"><option>Need it this week</option><option>Planning a build</option><option>Auditing a workflow</option></select></label>
        <button type="submit">Recommend a pack</button>
      </form>
      <div class="router-result" data-router-result aria-live="polite">Try a prompt like: "My RAG agent makes unsupported claims" or "I need Stripe downloads to unlock only after payment."</div>
    </section>`;
  }

  function insertRouter() {
    if (document.getElementById("ask-atlas-product-router")) return;
    const isGuardrailPage = Boolean(document.querySelector(".gr-shell"));
    const wrapper = document.createElement("div");
    wrapper.innerHTML = routerMarkup(isGuardrailPage);
    const section = wrapper.firstElementChild;
    const anchor = document.getElementById("guardrail-store") || document.querySelector(".chat-shell") || document.getElementById("agent-skill-bundles");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
  }

  function renderRecommendation(form, resultNode) {
    const formData = new FormData(form);
    const route = chooseRoute(formData.get("pain_point"), formData.get("platform"));
    resultNode.innerHTML = `<div class="router-card">
      <strong>Recommended kit:</strong> ${escapeHtml(route.kit)}<br>
      <strong>Recommended bundle:</strong> ${escapeHtml(route.bundle)}<br>
      <strong>Why it fits:</strong> It targets the exact proof gap in this workflow.<br>
      <strong>What it blocks:</strong> ${escapeHtml(route.blocks)}.<br>
      <div class="router-actions">
        <button type="button" data-router-buy="${escapeHtml(route.pack_id)}" data-product-type="agent_skill_pack" data-price="99">${isCheckoutLive() ? "Buy $99 Guardrail Kit" : "Ask Atlas about this pack"}</button>
        <button type="button" data-router-buy="${escapeHtml(route.bundle_id)}" data-product-type="agent_skill_bundle" data-price="${route.bundle_id === "agent-company-launch-kit" ? "499" : route.bundle_id === "agent-builder-starter-bundle" || route.bundle_id === "social-publisher-safety-bundle" ? "249" : "299"}">${isCheckoutLive() ? "Buy Bundle" : "Ask Atlas about this bundle"}</button>
        <a href="ask-atlas.html">Ask Atlas setup review</a>
      </div>
      <p class="checkout-note">${checkoutNote()}</p>
    </div>`;
  }

  function bindRouter() {
    document.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-agent-skill-router]");
      if (!form) return;
      event.preventDefault();
      const result = form.parentElement.querySelector("[data-router-result]");
      if (result) renderRecommendation(form, result);
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-router-buy]");
      if (!button || button.dataset.routerHandled === "true") return;
      if (!window.AtlasGuardrailCheckout) return;
      event.preventDefault();
      button.dataset.routerHandled = "true";
      window.AtlasGuardrailCheckout.start(button.dataset.routerBuy, button);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    updatePositioningCopy();
    insertBundles();
    insertRouter();
    bindRouter();
  });
})();
