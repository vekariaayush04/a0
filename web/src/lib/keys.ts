// Keyboard map hook. Ignores shortcuts while focus is inside a text field.

import { useEffect, useRef } from "react";

export type KeyHandler = (event: KeyboardEvent) => void;
export type KeyMap = Record<string, KeyHandler | undefined>;

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** Attach a window keydown listener mapping `event.key` to a handler.
 *  Handlers are read through a ref so the effect only re-binds on `deps`. */
export function useKeys(map: KeyMap, deps: unknown[] = []): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const handler = ref.current[event.key];
      if (!handler) return;
      handler(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
