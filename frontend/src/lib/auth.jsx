import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { formatApiError, setStoredToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = unauth, obj = user
  const [error, setError] = useState("");

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Live-refresh: when the tab regains focus or visibility, pull fresh /auth/me so
  // server-side permission changes pushed by a super-admin take effect without
  // requiring the office-admin to sign out and back in. Only runs when logged in.
  useEffect(() => {
    if (!user || user === false) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMe();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user, fetchMe]);

  const login = useCallback(async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      // Backend returns the JWT in the body alongside the user object so
      // cross-origin deploys (where Chrome blocks third-party cookies) can
      // fall back to Authorization: Bearer auth.
      if (data?.access_token) setStoredToken(data.access_token);
      const { access_token: _t, ...rest } = data || {};
      setUser(rest);
      return true;
    } catch (e) {
      // Prefer the server-side error detail; fall through to the underlying
      // axios/JS error message when there's no server response (network blip,
      // CORS rejection, localStorage exception, etc.) so users see something
      // actionable instead of the generic "Something went wrong".
      const serverDetail = e?.response?.data?.detail;
      setError(serverDetail ? formatApiError(serverDetail) : (e?.message || formatApiError(null)));
      return false;
    }
  }, []);

  const register = useCallback(async (payload) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", payload);
      // Backend returns {ok, approval_status, message} — user must be approved before login
      return { ok: true, pending: data?.approval_status === "pending", message: data?.message };
    } catch (e) {
      const serverDetail = e?.response?.data?.detail;
      setError(serverDetail ? formatApiError(serverDetail) : (e?.message || formatApiError(null)));
      return { ok: false };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // Surface server-side logout failures in dev tools but always clear
      // the local session so the user isn't stuck.
      console.error("[auth] logout failed:", err?.message || err);
    }
    setStoredToken(null);
    setUser(false);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { data } = await api.patch("/auth/me", payload);
    setUser(data);
    return data;
  }, []);

  // Stabilise the context value so consumers don't re-render whenever
  // AuthProvider re-renders for unrelated reasons. New reference is only
  // produced when one of the actual deps changes.
  const ctxValue = useMemo(
    () => ({ user, error, setError, login, register, logout, updateProfile, refresh: fetchMe }),
    [user, error, login, register, logout, updateProfile, fetchMe],
  );

  return (
    <AuthContext.Provider value={ctxValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
