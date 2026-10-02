"use client";

import { useSyncExternalStore } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

// The effective theme is <html data-theme> when set (saved choice), else the system
// setting. Watch both so every toggle on the page stays in sync.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = darkQuery();
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function getTheme(): Theme {
  const saved = document.documentElement.dataset.theme;
  if (saved === "light" || saved === "dark") return saved;
  return darkQuery().matches ? "dark" : "light";
}

export function ThemeToggle({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  // null on the server, so the first client render matches the HTML and swaps in after hydration.
  const theme = useSyncExternalStore<Theme | null>(subscribe, getTheme, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    // A cookie (not localStorage) so the server can render the right theme on the next load.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const label = `Switch to ${next} mode`;
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={`btn-ghost inline-flex items-center gap-2 ${className}`}>
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
      {showLabel && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
