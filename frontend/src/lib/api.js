import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Token storage helpers — used as a fallback when cross-origin cookies are
// blocked by the browser (e.g. Chrome's third-party cookie deprecation when
// frontend is on vercel.app and backend on railway.app).
const TOKEN_KEY = "finflow_access_token";
export const setStoredToken = (t) => {
  if (!t) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, t);
};
export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

const api = axios.create({
  baseURL: API,
  withCredentials: true,
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
  return config;
});

// If the server tells us the token is invalid/expired, wipe local storage so
// the auth context can pick up the change on the next /auth/me poll.
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err?.response?.status === 401) {
      setStoredToken(null);
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
