"use client";

import { useEffect, useRef, useState } from "react";

/** Counts toward `value` over ~600ms; jumps instantly under prefers-reduced-motion (spec G2). */
export function AnimatedNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const start = current.current;
    const delta = value - start;
    if (delta === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 600;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = duration ? Math.min(1, (t - t0) / duration) : 1;
      const v = start + delta * (1 - (1 - p) ** 3);
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{shown.toFixed(decimals)}</>;
}
