import React, { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades + slides its children in once they scroll into view (Intersection
 * Observer). Reveals only the first time, then stays put. Honours "reduce
 * motion" by rendering the content visible immediately with no movement.
 *
 * Props:
 *   as        element/tag to render (default "div")
 *   className extra classes merged with the reveal base
 *   testid    data-testid passthrough
 */
export default function Reveal({ as: Tag = "div", className = "", children, testid, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) { setVisible(true); return undefined; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-testid={testid}
      className={`reveal-on-scroll${visible ? " reveal-in" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}
