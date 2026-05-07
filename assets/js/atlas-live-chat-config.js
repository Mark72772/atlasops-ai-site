window.AtlasLiveChatConfig = Object.freeze({
  provider: "cloudflare_durable_object",
  workerUrl: "https://atlasops-live-chat.atlasops-ai.workers.dev",
  siteId: "atlasops-ai",
  mode: "live_when_atlas_online_email_fallback",
  publicRuntimeExposure: false,
});
