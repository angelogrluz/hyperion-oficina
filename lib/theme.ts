const KEY = "oficinaplan-theme";
const listeners = new Set<() => void>();

export type ThemeChoice = "light" | "dark";

export function readTheme(): ThemeChoice {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(theme: ThemeChoice) {
  localStorage.setItem(KEY, theme);
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toggleTheme() {
  writeTheme(readTheme() === "dark" ? "light" : "dark");
}
