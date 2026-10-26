// Web App Badging API helper.
//
// On an INSTALLED PWA (iOS 16.4+, Android/Chrome, desktop Chrome/Edge) this sets
// the numeric badge shown on the home-screen / dock app icon. It is a no-op in
// regular browser tabs and where the API is unsupported, so it is always safe
// to call.
export function setAppBadge(count) {
  try {
    if (typeof navigator === "undefined") return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n > 0 && typeof navigator.setAppBadge === "function") {
      navigator.setAppBadge(n);
    } else if (typeof navigator.clearAppBadge === "function") {
      navigator.clearAppBadge();
    }
  } catch {
    /* badging not permitted/supported — ignore */
  }
}

export function clearAppBadge() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clearAppBadge === "function") {
      navigator.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}
