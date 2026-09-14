// Theme plumbing. The theme itself lives in the store (persisted to
// localStorage, overridable with `?theme=light`); this component only keeps
// the <html> attributes in sync and re-resolves "system" when the OS flips.

import { useEffect, type ReactNode } from "react";
import { applyTheme, useStore } from "@/state/store";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
