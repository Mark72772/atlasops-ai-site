(function () {
  window.ATLAS_ASSISTANT_CONFIG = Object.freeze({
    siteId: "atlasops-ai",
    relayProvider: "cloudflare_worker",
    relayUrl: "https://atlasops-live-chat.atlasops-ai.workers.dev",
    mode: "live_when_available_queued_fallback",
    messageEndpoint: "/chat/message",
    healthEndpoint: "/health",
    replyEndpointPrefix: "/reply/",
    sessionEndpointPrefix: "/chat/session/",
    enableWebSocket: true,
    enablePublicSearchDisclosure: true,
    enableLearningDisclosure: true
  });
})();
