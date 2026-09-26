import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Check, X } from "@phosphor-icons/react";
import { subscribe, getSnapshot, setOverlayMounted, dismissCelebration } from "@/lib/celebrate";

const SUCCESS_MS = 1700;
const ERROR_MS = 2600;

const SUCCESS_SUBTITLE = {
  Added: "Your new record has been created.",
  Saved: "Your changes have been saved.",
  Updated: "Your changes have been saved.",
  Deleted: "The item has been removed.",
};

/** Frosted-glass folder silhouette that sits inside the gradient hero. */
function GlassFolder() {
  return (
    <svg className="celebrate-folder" viewBox="0 0 156 126" aria-hidden="true">
      <path d="M22 32 Q22 21 33 21 L60 21 Q66 21 70 27 L75 35 Q77 38 82 38 L127 38 Q138 38 138 49 L138 96 Q138 107 127 107 L33 107 Q22 107 22 96 Z" />
    </svg>
  );
}

/**
 * Single, app-wide centered feedback overlay styled after the approved
 * reference: a white card with a gradient hero (green for success, crimson for
 * error), a frosted folder holding a white check/cross badge, a bold title and
 * a muted subtitle. Auto-dismisses, non-blocking, honors reduced motion.
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
  const caption = state.caption || (isError ? "Didn't go through" : "Saved");
  const title = isError ? caption : `${caption} successfully!`;
  const subtitle = isError
    ? state.message || "Something went wrong. Please try again."
    : SUCCESS_SUBTITLE[caption] || "All done.";

  return (
    <div
      className="celebrate-backdrop"
      data-kind={state.kind}
      data-testid="celebration-overlay"
      onClick={() => dismissCelebration(state.id)}
      aria-live="polite"
      role="status"
    >
      <div
        className="celebrate-card"
        data-testid={isError ? "celebration-error" : "celebration-success"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="celebrate-hero">
          <GlassFolder />
          <div className="celebrate-check-badge">
            {isError ? (
              <X size={30} weight="bold" className="celebrate-icon" />
            ) : (
              <Check size={32} weight="bold" className="celebrate-icon" />
            )}
          </div>
        </div>
        <div className="celebrate-body">
          <h3 className="celebrate-title" data-testid="celebration-caption">{title}</h3>
          <p className="celebrate-subtitle" data-testid="celebration-message">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
