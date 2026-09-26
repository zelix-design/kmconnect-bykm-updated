import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Check, X } from "@phosphor-icons/react";
import { subscribe, getSnapshot, setOverlayMounted, dismissCelebration } from "@/lib/celebrate";

const SUCCESS_MS = 1250;
const ERROR_MS = 2200;

/**
 * Single, app-wide centered feedback overlay. Renders a big animated checkmark
 * on success or an animated cross on error, with a short caption, over a lightly
 * dimmed backdrop. Auto-dismisses and never traps the user. Honors reduced
 * motion via CSS (see index.css).
 */
export default function CelebrationOverlay() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const timerRef = useRef(null);

  useEffect(() => {
    setOverlayMounted(true);
    return () => setOverlayMounted(false);
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    const ttl = state.kind === "error" ? ERROR_MS : SUCCESS_MS;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => dismissCelebration(state.id), ttl);
    return () => clearTimeout(timerRef.current);
  }, [state]);

  if (!state) return null;

  const isError = state.kind === "error";
  const testid = isError ? "celebration-error" : "celebration-success";

  return (
    <div
      className="celebrate-backdrop"
      data-kind={state.kind}
      data-testid="celebration-overlay"
      onClick={() => dismissCelebration(state.id)}
      aria-live="polite"
      role="status"
    >
      <div className="celebrate-card" data-testid={testid} onClick={(e) => e.stopPropagation()}>
        <div className={`celebrate-badge ${isError ? "is-error" : "is-success"}`}>
          <span className="celebrate-ring" aria-hidden="true" />
          {isError ? (
            <X size={40} weight="bold" className="celebrate-icon" />
          ) : (
            <Check size={44} weight="bold" className="celebrate-icon" />
          )}
        </div>
        <p className="celebrate-caption" data-testid="celebration-caption">{state.caption}</p>
        {state.message ? (
          <p className="celebrate-message" data-testid="celebration-message">{state.message}</p>
        ) : null}
      </div>
    </div>
  );
}
