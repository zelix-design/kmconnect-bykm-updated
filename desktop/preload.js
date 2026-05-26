// Preload runs in an isolated context. We don't expose anything to the renderer
// today (the web app is self-contained). Keep this file so contextIsolation
// remains on and we have a hook for future native integrations.
window.addEventListener("DOMContentLoaded", () => {
  // No-op for now.
});
