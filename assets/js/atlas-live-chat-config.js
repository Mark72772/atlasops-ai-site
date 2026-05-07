window.ATLAS_LIVE_CHAT_CONFIG = Object.freeze({
  siteId: "atlasops-ai",
  relayProvider: "cloudflare_worker",
  relayUrl: "https://atlasops-live-chat.atlasops-ai.workers.dev",
  mode: "live_when_available_email_fallback",
  askEndpoint: "/ask",
  healthEndpoint: "/health",
  replyEndpointPrefix: "/reply/",
  safeFallbackEmail: "",
  enableFloatingWidget: true,
  enableQuickPrompts: true,
  enableOrbState: true
});

window.AtlasLiveChatConfig = Object.freeze({
  siteId: window.ATLAS_LIVE_CHAT_CONFIG.siteId,
  provider: window.ATLAS_LIVE_CHAT_CONFIG.relayProvider,
  workerUrl: window.ATLAS_LIVE_CHAT_CONFIG.relayUrl,
  mode: window.ATLAS_LIVE_CHAT_CONFIG.mode,
  publicRuntimeExposure: false
});
