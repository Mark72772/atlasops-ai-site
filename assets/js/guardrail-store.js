(function () {
  const grid = document.getElementById("guardrailCards");
  if (!grid) return;

  const staticFallbackHtml = grid.innerHTML;
  let items = [];
  let filter = "";
  const search = document.getElementById("guardrailSearch");
  const sort = document.getElementById("guardrailSort");

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function score(item, query) {
    const text = String(item.content || "").toLowerCase();
    let value = text.includes(query) ? 10 : 0;
    if ((item.compatible_systems || []).join(" ").toLowerCase().includes(query)) value += 6;
    if (String(item.category || "").toLowerCase().includes(query)) value += 4;
    if (String(item.product_type || "").toLowerCase().includes(query)) value += 4;
    return value;
  }

  function card(item) {
    const systems = (item.compatible_systems || []).slice(0, 5).map((system) => `<span>${escapeHtml(system)}</span>`).join("");
    const detailUrl = escapeHtml(item.detail_url || `guardrails/${item.pack_id}.html`);
    const productType = String(item.product_type || item.service_type || "agent_skill_pack");
    const isBundle = productType.includes("bundle") || String(item.category || "").toLowerCase().includes("bundle");
    const label = isBundle ? "Agent Skill Bundle" : "Agent Skill Pack";
    const price = escapeHtml(item.price || 99);
    const buttonText = isBundle ? `Buy $${price} Bundle` : `Buy $${price} Agent Skill Pack`;
    return `<article class="gr-card" data-pack-id-card="${escapeHtml(item.pack_id)}">
      <h2>${escapeHtml(item.name)}</h2>
      <p>${escapeHtml(item.pain_point)}</p>
      <div class="systems">${systems}</div>
      <p><strong>Verification:</strong> ${escapeHtml((item.proof_requirements || []).join(", "))}</p>
      <div class="meta"><span>$${price}</span><span>${label}</span></div>
      <div class="card-actions">
        <a href="${detailUrl}">Details</a>
        <button type="button" data-pack-id="${escapeHtml(item.pack_id)}" data-payment-provider="stripe" data-product-type="${escapeHtml(productType)}" data-price="${price}" data-checkout-gate="stripe_worker_url_missing|stripe_key_rotation_required|stripe_worker_secrets_missing">${buttonText}</button>
      </div>
      <p class="checkout-note" data-checkout-gate="stripe_worker_url_missing|stripe_key_rotation_required|stripe_worker_secrets_missing">Stripe Checkout live. Delivery unlocks after verified Stripe payment evidence.</p>
    </article>`;
  }

  function render() {
    const query = (search && search.value || "").trim().toLowerCase();
    const selectedSort = sort && sort.value || "Most relevant";
    let rows = items.filter((item) => {
      const filterText = [item.category, ...(item.compatible_systems || [])].join(" ").toLowerCase();
      return !filter || filterText.includes(filter.toLowerCase());
    });
    if (query) {
      rows = rows
        .map((item) => ({ ...item, _score: score(item, query) }))
        .filter((item) => item._score > 0 || String(item.name || "").toLowerCase().includes(query) || String(item.pain_point || "").toLowerCase().includes(query));
    }
    if (selectedSort.includes("Newest")) rows = rows.slice().reverse();
    else if (query) rows = rows.sort((a, b) => (b._score || 0) - (a._score || 0));
    grid.innerHTML = rows.map(card).join("") || staticFallbackHtml || '<p class="gr-empty">No guardrail matches that search yet.</p>';
    if (window.AtlasGuardrailCheckout && typeof window.AtlasGuardrailCheckout.refresh === "function") {
      window.AtlasGuardrailCheckout.refresh();
    }
  }

  fetch(grid.dataset.storePath || "data/guardrail-store.json")
    .then((response) => response.json())
    .then((data) => {
      items = data.items || data;
      render();
    })
    .catch(() => {
      if (!grid.innerHTML.trim()) {
        grid.innerHTML = '<p class="gr-empty">Guardrail store data could not load. Product pages remain available from the Guardrail Store navigation.</p>';
      }
    });

  if (search) search.addEventListener("input", render);
  if (sort) sort.addEventListener("change", render);
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = filter === button.dataset.filter ? "" : button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button && filter));
    render();
  }));

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pack-id]");
    if (!button) return;
    if (window.AtlasGuardrailCheckout) {
      window.AtlasGuardrailCheckout.start(button.dataset.packId, button);
    } else {
      button.dataset.checkoutGate = "stripe_checkout_script_missing";
      button.setAttribute("aria-disabled", "true");
      button.textContent = "Stripe Checkout unavailable";
    }
  });
})();

