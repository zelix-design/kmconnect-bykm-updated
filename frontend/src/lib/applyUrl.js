/* Resolves the public admission-form URL.
 *
 * When `REACT_APP_APPLY_PUBLIC_URL` is set (e.g. `https://apply.kmfoundation.online`)
 * every "share this referral" link AND every in-app redirect to the apply form
 * points to that domain. When unset, we fall back to the original same-origin
 * `/apply` path so local dev + preview deployments keep working unchanged.
 *
 * Use `buildApplyUrl(ref)` to compose a referral URL.
 * Use `navigateToApply(nav, ref)` to drive in-app + cross-origin redirects from
 * a `useNavigate()` hook.
 */

function rawBase() {
  return (process.env.REACT_APP_APPLY_PUBLIC_URL || "").trim();
}

function normalizedBase() {
  let base = rawBase();
  if (!base) return "";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
}

/** Returns the absolute or relative URL to open the apply form, optionally
 * pre-tagging a sub-agent / associate-consultant referral via `ref`. */
export function buildApplyUrl(ref) {
  const base = normalizedBase();
  const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  if (base) return `${base}/${qs}`;
  // Fallback: same-origin SPA route
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/apply${qs}`;
}

/** True when the public apply URL is configured to a different origin than
 * the page that's currently rendering. Useful to decide between `nav(...)`
 * (client-side route) and `window.location.assign(...)` (full reload). */
export function applyIsCrossOrigin() {
  const base = normalizedBase();
  if (!base) return false;
  if (typeof window === "undefined") return false;
  try {
    const target = new URL(base);
    return target.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Navigate the user to the apply form, optionally with `ref`. Uses the
 * supplied react-router `useNavigate()` for same-origin redirects and a
 * full `window.location.assign` for cross-origin ones. Pass `replace=true`
 * to mimic `nav(url, { replace: true })`. */
export function navigateToApply(nav, ref, { replace = false } = {}) {
  const target = buildApplyUrl(ref);
  if (applyIsCrossOrigin()) {
    if (typeof window === "undefined") return;
    if (replace) window.location.replace(target);
    else window.location.assign(target);
    return;
  }
  // Same-origin → reuse SPA navigation (strip the absolute prefix so
  // react-router treats it as an internal path).
  const path = target.startsWith("http")
    ? new URL(target).pathname + new URL(target).search
    : target;
  nav(path, replace ? { replace: true } : undefined);
}
