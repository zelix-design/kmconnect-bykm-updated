import axios from "axios";
import { celebrate } from "@/lib/celebrate";

// Endpoints whose mutations are background/automatic (not user-initiated) and
// must NOT pop the success celebration.
const CELEBRATE_EXCLUDES = ["/auth", "/push", "/webauthn", "/notifications", "/login-attempts", "/uploads"];

function celebrationCaption(method, status) {
  const m = (method || "").toLowerCase();
  if (m === "delete") return "Deleted";
  if (m === "patch" || m === "put") return "Updated";
  if (m === "post") return status === 201 ? "Added" : "Saved";
  return null;
}

// Significant wins get a festive confetti burst + tailored wording; routine
// saves keep the plain folder-check popup.
function milestoneFor(method, url) {
  if ((method || "").toLowerCase() !== "post") return null;
  if (/\/convert$/.test(url)) {
    return { title: "Lead converted!", subtitle: "A new student has been enrolled." };
  }
  if (/\/payments$/.test(url)) {
    return { title: "Payment recorded!", subtitle: "The fee payment has been saved." };
  }
  return null;
}

function maybeCelebrate(resp) {
  try {
    const cfg = resp?.config || {};
    const method = (cfg.method || "get").toLowerCase();
    if (!["post", "put", "patch", "delete"].includes(method)) return;
    if (cfg.skipCelebration) return;
    const url = cfg.url || "";
    if (CELEBRATE_EXCLUDES.some((x) => url.includes(x))) return;
    const milestone = milestoneFor(method, url);
    if (milestone) {
      celebrate({ kind: "success", caption: "Saved", milestone: true, title: milestone.title, subtitle: milestone.subtitle });
      return;
    }
    const caption = celebrationCaption(method, resp?.status);
    if (caption) celebrate({ kind: "success", caption });
  } catch {
    /* feedback is best-effort — never break a request */
  }
}

// Defensive URL normalization: in some Vercel/Netlify dashboards, operators
// configure REACT_APP_BACKEND_URL without the scheme (e.g. just the bare
// "myapp.up.railway.app" instead of "https://myapp.up.railway.app"). Without
// a scheme, axios treats the value as a relative path and prepends the
// current origin — so requests silently land on the SPA host, return the
// index.html, and look like a successful 200 with empty payload. Catch that
// here so a misconfigured env var still produces a working app.
function normalizeBackend(raw) {
  const v = (raw || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

const BACKEND_URL = normalizeBackend(process.env.REACT_APP_BACKEND_URL);
export const API = `${BACKEND_URL}/api`;

// ---- Global Academic Year filter ----------------------------------------
// A single selected calendar year is injected into every GET request as
// `?year=`, so list/aggregation endpoints across the whole app return only
// that year's data. "all" (or null) means no filtering. Initialised
// synchronously from localStorage so the very first requests already carry it.
const YEAR_KEY = "finflow_academic_year";
let selectedYear = (() => {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(YEAR_KEY) : null;
    return v || null;
  } catch {
    return null;
  }
})();

export const setApiYear = (y) => {
  selectedYear = y == null ? null : String(y);
  try {
    if (!selectedYear) window.localStorage.removeItem(YEAR_KEY);
    else window.localStorage.setItem(YEAR_KEY, selectedYear);
  } catch {
    /* private mode — in-memory only */
  }
};

export const getApiYear = () => selectedYear;

// Token storage helpers — used as a FALLBACK when cross-origin cookies are
// blocked by the browser (e.g. Chrome's third-party cookie deprecation when
// frontend and backend live on different sub/domains in production).
//
// MOBILE-SAFE: many mobile webviews & private-mode browsers reject
// localStorage with QuotaExceededError / SecurityError on the very first
// write (Safari private mode, Instagram/FB/TikTok in-app browsers, Brave
// strict shields, some Android WebViews). If we let those throw the login
// flow surfaces a generic "Something went wrong" toast. Catch defensively
// and degrade to a same-tab in-memory token store — auth still works for
// the duration of the session and is automatically restored if persistence
// becomes available again.
//
// SECURITY NOTE: localStorage is intentionally chosen as the cross-origin
// fallback, knowing it is read-accessible to any script on this origin.
// Mitigations:
//   • Same-origin deploys use httpOnly + Secure + SameSite=Strict cookies
//     (set by backend `/auth/login`) — localStorage is then dormant.
//   • The token is a short-lived JWT (7-day exp); backend can revoke a stolen
//     token via the password-reset endpoint which clears `password_reset_at`.
//   • The codebase has no `dangerouslySetInnerHTML` user-content paths, so XSS
//     attack surface is limited to vendored deps which are version-pinned.
const TOKEN_KEY = "finflow_access_token";

// Module-scoped in-memory mirror — only used when localStorage is unavailable.
let inMemoryToken = null;

function safeLocalStorage() {
  // Touching `window.localStorage` itself can throw on some browsers (Safari
  // ITP, some Android WebViews when the host disabled DOM storage). Guard the
  // *access*, not just the call.
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export const setStoredToken = (t) => {
  inMemoryToken = t || null;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    if (!t) ls.removeItem(TOKEN_KEY);
    else ls.setItem(TOKEN_KEY, t);
  } catch {
    // QuotaExceededError / SecurityError — fall back to in-memory only.
  }
};

export const getStoredToken = () => {
  const ls = safeLocalStorage();
  if (ls) {
    try {
      const t = ls.getItem(TOKEN_KEY);
      if (t) return t;
    } catch {
      // ignore — fall through to in-memory mirror
    }
  }
  return inMemoryToken;
};

const api = axios.create({
  baseURL: API,
  withCredentials: true,
  // 25s is generous enough for slow mobile networks yet short enough that a
  // truly-dropped request fails loud instead of hanging the login button
  // forever. Android carriers occasionally stall TLS handshakes indefinitely.
  timeout: 25_000,
});

// Attach Authorization: Bearer <token> to every request when we have a
// stored token. Backend reads either the cookie OR the Authorization header
// (see auth_lib.get_current_user), so same-origin deploys keep using cookies
// and cross-origin deploys transparently fall back to localStorage.
api.interceptors.request.use((config) => {
  const t = getStoredToken();
  if (t) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  // Inject the globally-selected academic year into GET requests so every
  // page's data is scoped consistently. Endpoints that don't declare `year`
  // simply ignore the extra query param (FastAPI drops unknown params).
  // Clients / Employees (/clients) and Messages (/messages) are intentionally
  // exempt — they are not academic-year scoped.
  const method = (config.method || "get").toLowerCase();
  const url = config.url || "";
  const yearExempt = /(^|\/)(clients|messages)(\/|$|\?)/.test(url);
  if (method === "get" && !yearExempt && selectedYear && selectedYear !== "all") {
    if (config.params == null) config.params = {};
    if (config.params.year == null) config.params.year = selectedYear;
  }
  return config;
});

// Retry-once on transient network / timeout failures. Common on Android
// carrier networks where the first TLS handshake races the DNS resolver and
// axios sees "Network Error" before the browser has actually completed the
// connect. A single retry with 400ms backoff turns a scary "network error"
// toast into a successful login for the vast majority of users.
function _shouldRetry(err) {
  if (!err) return false;
  // Axios manufactures a fresh Error object on every attempt, so a flag on
  // the error itself is invisible to the next call. The `config` object,
  // however, is REUSED across retry attempts — that's where we mark the
  // attempt and where we check it on subsequent failures.
  if (err?.config?.__retried) return false;
  // No response received → transport-layer failure.
  if (!err.response && err.config) {
    const msg = String(err.message || "").toLowerCase();
    return (
      err.code === "ECONNABORTED" ||
      err.code === "ERR_NETWORK" ||
      msg.includes("network error") ||
      msg.includes("timeout")
    );
  }
  return false;
}
api.interceptors.response.use(
  (resp) => {
    maybeCelebrate(resp);
    return resp;
  },
  async (err) => {
    if (_shouldRetry(err)) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        // Mark on the config (which axios preserves across attempts) so the
        // next failure trips the guard and doesn't loop indefinitely.
        return await api.request({ ...err.config, __retried: true });
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }
    return Promise.reject(err);
  },
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
