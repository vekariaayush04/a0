// Minimal external store on top of useSyncExternalStore. No Redux, no
// provider: components subscribe with `useStore(selector)`.

import { useSyncExternalStore } from "react";
import type { Run, Session, Stats } from "../api/types";

export type Theme = "system" | "light" | "dark";
export type View = "list" | "tree";

export type State = {
  sessions: Session[];
  runsBySession: Record<string, Run[]>;
  stats: Stats | null;
  selectedSession: string | null;
  selectedRun: string | null;
  selectedSub: number | null;
  view: View;
  theme: Theme;
  /** True while the keyboard-shortcut overlay is open. */
  overlayOpen: boolean;
};

const THEME_KEY = "sentinel.theme";

/** `?theme=light|dark|system` wins over the stored choice, for screenshotting. */
function themeFromSearch(): Theme | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("theme");
  if (value === "system" || value === "light" || value === "dark") return value;
  return null;
}

function readStoredTheme(): Theme {
  const forced = themeFromSearch();
  if (forced) return forced;
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "system" || value === "light" || value === "dark") return value;
  } catch {
    /* localStorage may be unavailable */
  }
  return "system";
}

/** True when "system" currently resolves to dark. */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Paint the theme onto <html>. shadcn keys off `.dark`; the legacy Tree
 *  screens key off `[data-theme]`. Both are written so the two agree. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

let state: State = {
  sessions: [],
  runsBySession: {},
  stats: null,
  selectedSession: null,
  selectedRun: null,
  selectedSub: null,
  view: "list",
  theme: readStoredTheme(),
  overlayOpen: false,
};

applyTheme(state.theme);

const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function setState(
  patch: Partial<State> | ((current: State) => Partial<State>),
): void {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

export function useStore<T>(selector: (current: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---- actions -----------------------------------------------------------

export function setSessions(sessions: Session[]): void {
  setState({ sessions });
}

export function setRunsForSession(sessionId: string, runs: Run[]): void {
  setState((current) => ({
    runsBySession: { ...current.runsBySession, [sessionId]: runs },
  }));
}

export function setRuns(runs: Run[]): void {
  const bySession: Record<string, Run[]> = {};
  for (const run of runs) {
    (bySession[run.sessionId] ??= []).push(run);
  }
  setState({ runsBySession: bySession });
}

/** Patch a single run wherever it is cached (used by SSE status frames). */
export function patchRun(run: Run): void {
  setState((current) => {
    const existing = current.runsBySession[run.sessionId];
    if (!existing) return {};
    const found = existing.some((r) => r.id === run.id);
    const next = found
      ? existing.map((r) => (r.id === run.id ? run : r))
      : [run, ...existing];
    return { runsBySession: { ...current.runsBySession, [run.sessionId]: next } };
  });
}

export function setStats(stats: Stats): void {
  setState({ stats });
}

export function selectSession(id: string | null): void {
  setState({ selectedSession: id, selectedRun: null, selectedSub: null });
}

/** Point at the session that owns a run without clearing the run selection.
 *  Used when a deep link (`#/r/<id>`) arrives before its session is known. */
export function selectSessionForRun(sessionId: string): void {
  if (state.selectedSession === sessionId) return;
  setState({ selectedSession: sessionId });
}

export function selectRun(id: string | null): void {
  setState({ selectedRun: id, selectedSub: null });
}

export function selectSub(index: number | null): void {
  setState({ selectedSub: index });
}

export function setView(view: View): void {
  setState({ view });
}

export function setOverlayOpen(open: boolean): void {
  if (state.overlayOpen === open) return;
  setState({ overlayOpen: open });
}

export function toggleOverlay(): void {
  setState({ overlayOpen: !state.overlayOpen });
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
  setState({ theme });
}

export function cycleTheme(): void {
  const order: Theme[] = ["system", "light", "dark"];
  const index = order.indexOf(getState().theme);
  setTheme(order[(index + 1) % order.length]);
}
