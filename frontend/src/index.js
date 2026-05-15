import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Suppress benign ResizeObserver loop warning surfaced by Recharts in dev.
// CRA's react-error-overlay catches window errors — we squelch this specific
// one so it never paints the red overlay during development. Production builds
// don't include the overlay, so this is purely cosmetic.
if (typeof window !== "undefined") {
  const RESIZE_OBSERVER_WARNS = [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ];
  const swallow = (msg) => RESIZE_OBSERVER_WARNS.some((m) => String(msg).includes(m));
  window.addEventListener("error", (e) => {
    if (swallow(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (swallow(e.reason?.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

