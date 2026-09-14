// Motion vocabulary for Sentinel UI v3.
//
// One easing, three durations, four variants. Every animated surface in the
// app should pull from here rather than inventing its own numbers, so panes,
// rows and routes all move with the same hand.
//
// Everything is reduced-motion aware: `useReducedMotion()` from motion/react
// drives `useMotion()`, and the variant factories collapse to a plain
// opacity/no-op when motion is reduced.

import { useReducedMotion, type Transition, type Variants } from "motion/react";

/** Standard ease-out. Matches the CSS transitions on non-motion elements. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  /** Hovers and colour changes. */
  fast: 0.12,
  /** List item enter, chip enter. The house default. */
  base: 0.18,
  /** Pane and route transitions. */
  slow: 0.24,
} as const;

export const transition: Transition = { duration: DURATION.base, ease: EASE };

/** The house enter: opacity 0 -> 1 with a 6px rise. */
export function riseVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0 : DURATION.base, ease: EASE },
    },
    exit: {
      opacity: 0,
      y: reduced ? 0 : -4,
      transition: { duration: reduced ? 0 : DURATION.fast, ease: EASE },
    },
  };
}

/** Route/pane crossfade. Slightly slower and without the y travel, so the
 *  whole pane does not appear to jump when the content is tall. */
export function paneVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : 4 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0 : DURATION.slow, ease: EASE },
    },
    exit: {
      opacity: 0,
      transition: { duration: reduced ? 0 : DURATION.fast, ease: EASE },
    },
  };
}

/** Parent of a list whose children use `riseVariants`. Staggering is capped so
 *  a 200-row list does not take four seconds to appear. */
export function listVariants(reduced: boolean, count = 0): Variants {
  const stagger = reduced || count > 24 ? 0 : 0.018;
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: 0 } },
    exit: {},
  };
}

/**
 * The hook every component should use. Returns the reduced-motion flag plus
 * the three ready-made variant sets, so a screen is one line away from
 * house-standard motion:
 *
 *   const { rise, list, reduced } = useMotion();
 */
export function useMotion(count = 0) {
  const reduced = useReducedMotion() ?? false;
  return {
    reduced,
    transition: { duration: reduced ? 0 : DURATION.base, ease: EASE } as Transition,
    rise: riseVariants(reduced),
    pane: paneVariants(reduced),
    list: listVariants(reduced, count),
  };
}
