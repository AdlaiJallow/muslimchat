export type Theme = "light" | "dark";

/** Cookie holding the user's explicit choice; absent means "follow the system". */
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}
