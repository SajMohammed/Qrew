export type Theme = "light" | "dark";

/** Browser-bar colour per theme: the canvas, so the bar and the page read as one surface. */
export const THEME_COLOR: Record<Theme, string> = { light: "#eceeea", dark: "#0d0f0d" };

/** Softform's dark tokens apply under `.dark` on <html>. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}
