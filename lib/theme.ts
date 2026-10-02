export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in <head> before first paint so there's no flash of the wrong theme: a saved
 * choice wins, otherwise the system setting (which it keeps following until the user picks).
 */
export const themeInitScript = `(() => {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let saved = null;
  try { saved = localStorage.getItem("${THEME_STORAGE_KEY}"); } catch {}
  const apply = (t) => { root.dataset.theme = t; };
  apply(saved === "light" || saved === "dark" ? saved : media.matches ? "dark" : "light");
  media.addEventListener("change", (e) => {
    let s = null;
    try { s = localStorage.getItem("${THEME_STORAGE_KEY}"); } catch {}
    if (s !== "light" && s !== "dark") apply(e.matches ? "dark" : "light");
  });
})();`;
