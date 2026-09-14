// Media query as React state, for the few places a breakpoint must change the
// tree rather than just the classes (the single-pane phone layout, which must
// not mount a ResizablePanelGroup at all).

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** The three layout breakpoints used by the app frame. */
export const BREAKPOINTS = {
  /** Below this the sidebar collapses into a Sheet. */
  sidebar: "(min-width: 1100px)",
  /** Below this only the route's own pane is shown. */
  twoPane: "(min-width: 700px)",
} as const;
