"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { readTheme, subscribeTheme, toggleTheme } from "@/lib/theme";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      data-testid="modo-escuro"
      aria-pressed={dark}
      onClick={toggleTheme}
      className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-[15px] font-semibold text-[var(--text)] hover:bg-[var(--mist)]"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {dark ? "Modo claro" : "Modo escuro"}
    </button>
  );
}
