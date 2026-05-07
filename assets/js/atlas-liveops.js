(function () {
  const statusBadges = document.querySelectorAll("[data-liveops-status]");
  const widgets = document.querySelectorAll(".ask-atlas-widget");

  function relayReady() {
    return Boolean(window.AtlasLiveOps && window.AtlasLiveOps.config && window.AtlasLiveOps.config.relayWorkerUrl);
  }

  function stateLabel() {
    if (relayReady()) return "Ask Atlas - live when Atlas is online, email fallback when offline.";
    return "Ask Atlas - async reply by email until the Cloudflare relay is authorized.";
  }

  function paint() {
    const ready = relayReady();
    widgets.forEach((widget) => {
      widget.dataset.widgetState = ready ? "online" : "endpoint_setup_required";
      const badge = widget.querySelector(".ask-atlas-widget-badge");
      const title = widget.querySelector("h2");
      if (badge) badge.textContent = ready ? "Online" : "Relay authorization required";
      if (title && title.textContent.includes("Ask Atlas")) title.textContent = stateLabel();
    });
    statusBadges.forEach((badge) => {
      badge.textContent = ready ? "Ask Atlas online" : "Ask Atlas relay authorization required";
      badge.dataset.status = ready ? "online" : "endpoint_setup_required";
    });
  }

  document.addEventListener("DOMContentLoaded", paint);
  window.AtlasAskAtlasLiveTextBox = {
    status: () => ({
      ok: true,
      state: relayReady() ? "online" : "endpoint_setup_required",
      relay_configured: relayReady(),
      local_runtime_exposed: false,
    }),
    repaint: paint,
  };
})();
