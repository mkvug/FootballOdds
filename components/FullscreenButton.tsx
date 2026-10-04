"use client";

import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
};

export function FullscreenButton() {
  const active = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement !== null,
    () => false,
  );

  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={active ? "Exit full screen" : "Enter full screen"}
      className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
    >
      {active ? "Exit full screen" : "⛶ Full screen"}
    </button>
  );
}
