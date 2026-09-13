// Hash router: `#/s/<id>`, `#/r/<id>`, `#/r/<id>/sub/<n>`. No dependency.

import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "session"; sessionId: string }
  | { name: "run"; runId: string; sub: number | null };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "");
  let match: RegExpMatchArray | null;
  if ((match = path.match(/^\/r\/([^/]+)\/sub\/(\d+)$/)))
    return { name: "run", runId: decodeURIComponent(match[1]), sub: Number(match[2]) };
  if ((match = path.match(/^\/r\/([^/]+)$/)))
    return { name: "run", runId: decodeURIComponent(match[1]), sub: null };
  if ((match = path.match(/^\/s\/([^/]+)$/)))
    return { name: "session", sessionId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case "session":
      return `#/s/${encodeURIComponent(route.sessionId)}`;
    case "run":
      return route.sub === null
        ? `#/r/${encodeURIComponent(route.runId)}`
        : `#/r/${encodeURIComponent(route.runId)}/sub/${route.sub}`;
    default:
      return "";
  }
}

const listeners = new Set<() => void>();
function emit(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") window.addEventListener("hashchange", emit);

function sameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  if (a.name === "session" && b.name === "session") return a.sessionId === b.sessionId;
  if (a.name === "run" && b.name === "run")
    return a.runId === b.runId && a.sub === b.sub;
  return true;
}

let cached: Route =
  typeof window !== "undefined" ? parseHash(window.location.hash) : { name: "home" };

export function getRoute(): Route {
  if (typeof window === "undefined") return cached;
  const next = parseHash(window.location.hash);
  if (!sameRoute(next, cached)) cached = next;
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, () => ({ name: "home" }) as Route);
}

export function navigate(route: Route | string): void {
  if (typeof window === "undefined") return;
  const hash = typeof route === "string" ? route : routeHash(route);
  const target = hash.startsWith("#") ? hash : `#${hash}`;
  if (window.location.hash === target) {
    emit();
    return;
  }
  window.location.hash = target;
}
