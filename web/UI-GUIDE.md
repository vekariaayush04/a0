# a0 UI v3 — house guide

Read this before touching `web/src`. Follow it verbatim: the point is that a
screen written by someone who has never seen the app still looks like it was
drawn by the same hand.

The reference screen is **the runs panel + run detail**
(`src/features/runs/`). When this guide and a screen disagree, copy the
reference screen.

---

## 1. The design language in one paragraph

Monochrome. One neutral ramp supplies every surface, border and text colour, so
the palette has exactly one hue. There is exactly **one accent**, `#0a84ff`,
and it is reserved for live/running state — nowhere else, ever. Depth comes
from surface steps (background → card) plus 1px borders, not from shadows;
a single soft shadow (`shadow-float`) is allowed on popovers, sheets and the
command palette. Controls are 8px radius, cards 12px. Type is Geist Sans, with
Geist Mono for anything a machine produced: numbers, durations, costs, model
names, ids and paths. Density is comfortable — Linear or Vercel's dashboard,
not cramped, not airy.

---

## 2. Tokens

All tokens live in `src/styles.css` and are exposed through
`tailwind.config.ts`. **Never write a raw colour in a component.**

| Use | Class |
| --- | --- |
| Page ground | `bg-background` |
| Elevated card / row surface | `bg-card` |
| Subtle fill (chips, code blocks, tab strips) | `bg-muted` |
| Hover surface | `bg-accent` — *shadcn's hover surface, not the blue* |
| Primary text | `text-foreground` |
| Secondary text, labels, meta | `text-muted-foreground` |
| Hairlines | `border-border` |
| Focus ring | `ring-ring` |
| **Live / running only** | `text-live`, `bg-live` |
| Layout chrome steps | `bg-elev-0` (topbar, sidebar), `bg-elev-1` (stats footer) |

Dark is `hsl(0 0% 3%)` ground with `hsl(0 0% 7%)` cards; light is near-white.
`destructive` is deliberately mapped to the **foreground**, not red — a
destructive shadcn variant stays monochrome automatically.

Sizes: `text-10 / 11 / 12 / 13 / 15 / 20 / 26` (px, with line heights baked
in). Radius: `rounded-md` (6px) on small chips, `rounded-lg` (8px) on controls
and rows, `rounded-xl` (12px) on cards and dialogs.

There is a second, legacy family (`--fg`, `--fg-2`, `--line`, `bg-raised`, …)
still used by the Tree and Subagent screens. It is derived from the same ramp,
so the two agree. **Do not use it in new code**; delete usages as you rebuild
those screens.

---

## 3. What exists

### shadcn/ui (`src/components/ui/`, new-york, neutral, CSS variables)

`alert-dialog` · `badge` · `button` · `card` · `collapsible` · `command` ·
`dialog` · `dropdown-menu` · `input` · `resizable` · `scroll-area` ·
`separator` · `sheet` · `skeleton` · `sonner` · `tabs` · `tooltip`

Need another one: `cd web && bunx --bun shadcn@latest add <name>`. It is
configured for Tailwind **3** — do not migrate to v4. `resizable` is adapted to
react-resizable-panels v4 (`Group`/`Panel`/`Separator`, `orientation`), but
keeps the shadcn names, and its sizes take explicit units (`minSize="340px"`).

### Libraries, already wired — nothing to set up

| Library | Import | Notes |
| --- | --- | --- |
| `lucide-react` | `import { Terminal } from "lucide-react"` | the only icon source; no emoji, no inline SVG |
| `motion` | `import { motion } from "motion/react"` | framer-motion's successor |
| `@xyflow/react` | `import { ReactFlow } from "@xyflow/react"` | CSS already imported in `main.tsx`, already themed off our tokens |
| `@tanstack/react-virtual` | `useVirtualizer` | required for any list that can exceed a few hundred rows |
| `recharts` | — | nothing to set up |
| `sonner` | `import { toast } from "sonner"` | `<Toaster />` already mounted in App |
| `geist` | — | loaded via `@font-face` in `styles.css` |

### a0 primitives

- `src/features/runs/status.tsx` — **use these, do not re-derive them**:
  `StatusGlyph`, `StatusBadge`, `TierBadge`, `LiveDot`, `toolIcon(name)`.
- `src/lib/format.ts` — `fmtMs`, `fmtCost`, `ago`, `shortPath`, `baseName`,
  `tierLabel`. Never hand-format a duration or a cost.
- `src/lib/utils.ts` — `cn()`.
- `src/lib/motion.ts` — `useMotion()`.
- `src/lib/use-media-query.ts` — `useMediaQuery`, `BREAKPOINTS`.

---

## 4. File layout

```
web/src/
  api/            client.ts · sse.ts · types.ts   ← the contract. Read it, don't change it.
  components/
    ui/           shadcn-generated. Edit only to restyle a primitive globally.
    layout/       Sidebar · Topbar · CommandPalette · ShortcutsDialog
    theme-provider.tsx
  features/
    sessions/     SessionList.tsx
    runs/         derive.ts · hooks.ts · status.tsx · RunsPanel.tsx · detail/
    tree/         TreeView.tsx · SubagentView.tsx · layout.ts   ← to be rebuilt on React Flow
  lib/            utils · motion · format · keys · router · use-media-query
  state/store.ts  useStore(selector); actions below it
  styles.css      tokens
```

A screen lives under `features/<area>/`. Anything two areas need moves to
`lib/` or `components/`. Imports use the `@/` alias (`@/components/ui/button`),
never long relative chains.

---

## 5. How to compose a screen

```tsx
import { motion } from "motion/react";
import { Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusGlyph } from "@/features/runs/status";
import { fmtCost, fmtMs } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

export function Thing({ items }: { items: Item[] }) {
  const { rise, list } = useMotion(items.length);

  return (
    <motion.div variants={list} initial="hidden" animate="visible"
                className="flex flex-col gap-0.5 px-2 pb-4">
      {items.map((item) => (
        <motion.div key={item.id} variants={rise}>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left",
              "transition-[background-color,border-color] duration-150",
              item.selected
                ? "border-border bg-card"
                : "border-transparent hover:border-border/70 hover:bg-card/60",
            )}
          >
            <StatusGlyph status={item.status} />
            <span className="min-w-0 flex-1 truncate text-13 font-medium text-foreground">
              {item.title}
            </span>
            <span className="shrink-0 font-mono text-10 tabular-nums text-muted-foreground">
              {fmtMs(item.ms)}
            </span>
          </button>
        </motion.div>
      ))}
    </motion.div>
  );
}
```

That row — `rounded-lg`, transparent border that appears on hover, `bg-card`
when selected, 13px medium title, 10px mono muted numbers on the right — is
**the** row of this app. Reuse it for sessions, runs, tools and tree nodes.

### Motion

`useMotion(count)` returns `{ reduced, transition, rise, pane, list }`.

- `rise` — the house enter: opacity 0 → 1 with a 6px lift, 180ms. Every list
  item.
- `pane` — route/pane crossfade, 240ms. Wrap in `AnimatePresence mode="wait"`.
- `list` — the stagger parent for `rise` children (auto-disabled past 24 items).

Never write your own durations or easings, and never animate colour. With
reduced motion every variant collapses to its final state, so content is
**never** gated on an animation frame — keep it that way.

### Selection, hover, focus

Selected = surface step (`bg-card`) + a 2px `bg-foreground` bar pinned to the
left inset. Hover = border appears plus a fainter surface. Focus = Radix's
`ring-ring`; don't remove outlines.

---

## 6. Do / don't

**Do**

- Use `text-live` / `bg-live` for running state, and nothing else.
- Put every number, duration, cost, model name, id and path in `font-mono`,
  and add `tabular-nums` when it sits in a column.
- Right-align numeric columns and give them a fixed width so they line up.
- Use `truncate` with `min-w-0` on every flexible text cell.
- Virtualize anything that can exceed a few hundred rows.
- Give each scrolling region `min-h-0 flex-1 overflow-auto`, and make sure no
  ancestor between it and the content sets `h-full` or `overflow-hidden` — that
  is exactly what made the tree look clipped.
- Reach for a shadcn primitive before hand-rolling a control; accessibility is
  the reason they are here.

**Don't**

- No new colours. No red, green or amber — not for errors, not for status. An
  error is a 2px `border-l-foreground` bar and a lucide `AlertTriangle`.
- No accent on anything that is not live.
- No shadows, except `shadow-float` on popovers, sheets and the palette.
- No emoji, anywhere. No inline SVG icons — use lucide.
- No new state library, router or CSS framework. The store is
  `src/state/store.ts`; the router is `src/lib/router.ts`.
- Don't reformat or rewrite `src/api/*` — the types are the daemon contract.
- Don't edit `derive.ts`; the log folding and tool pairing are tested.
- Don't migrate Tailwind to v4.

---

## 7. Data and API

`src/api/types.ts` is the contract; read it first. `Run`, `Session`, `Stats`,
`SessionTree`/`RunTree`/`SubagentNode`, `Transcript`, and the `PiEvent` stream.

- `src/api/client.ts` — one typed fetcher per daemon route, all same-origin.
- `src/api/sse.ts` — `useRunEvents(runId, onEvent, onStatus, onReset)` for the
  per-run stream (the daemon replays on reconnect, so `onReset` must clear your
  accumulator) and `useGlobalStatus` for `/api/events`. **App already owns the
  single global subscription**; don't open a second one.
- State: `useStore(selector)` plus the actions below it in `store.ts`.

Live data to develop against: `http://127.0.0.1:4747`, session
`db89b445-00d3-41a7-a9f5-d433d30b9c44`, and a spawn tree with a subagent at
`/api/sessions/bench/tree`.

---

## 8. Still to do — the Tree and Subagent screens

`features/tree/TreeView.tsx` and `SubagentView.tsx` are the **old** UI. They
mount and work inside the new frame, but they still use the legacy tokens and
hand-rolled `src/ui/*` primitives (`Empty`, `Glyph`, `Pill`, `Tooltip`,
`icons`). Rebuilding them on `@xyflow/react` is the next job:

- `@xyflow/react` and its CSS are already wired, and `.react-flow` is already
  mapped onto our tokens in `styles.css` — a custom node just needs
  `bg-card border border-border rounded-xl`.
- `features/tree/layout.ts` computes a time-proportional layout. It is tested,
  but note that a long session produces a canvas tens of thousands of pixels
  tall; React Flow's pan/zoom is the fix, and the node geometry can come from
  React Flow's own layout instead.
- Timestamps from the daemon are **not** guaranteed: `ToolCall.t0` / `t1` can
  be absent even though the type says `number`. Guard before doing arithmetic.
- Delete `src/ui/*` once nothing imports it.

Everything else — tokens, primitives, motion, the frame — is done. Compose from
them; don't invent.
