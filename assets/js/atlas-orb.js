(function () {
  function setOrbState(state) {
    document.querySelectorAll("[data-atlas-orb-state]").forEach((node) => {
      node.dataset.atlasOrbState = state || "idle";
    });
  }

  document.addEventListener("atlas-orb-state", (event) => {
    setOrbState(event.detail?.state || "idle");
  });

  document.addEventListener("DOMContentLoaded", () => {
    setOrbState(document.body.dataset.atlasChatState || "idle");
  });
})();
