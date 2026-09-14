// Run list for the selected session: header with a List | Tree segmented
// control, then 60px rows with a status glyph, tier pill and live metadata.

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Run, Stats } from "../api/types";
import { ago, fmtCost, fmtMs, shortPath } from "../lib/format";
import { useKeys } from "../lib/keys";
import { navigate } from "../lib/router";
import { selectRun, setView, useStore } from "../state/store";
import { Glyph } from "../ui/Glyph";
import { Pill } from "../ui/Pill";

/** Match a model to a configured tier; anything else is "custom". */
function tierOf(model: string, tiers: Stats["tiers"] | null | undefined): string {
  if (!tiers || !model) return "custom";
  if (tiers.l1 === model) return "l1";
  if (tiers.l2 === model) return "l2";
  if (tiers.l3 === model) return "l3";
  return "custom";
}

function tierLabel(tier: string): string {
  return tier === "custom" ? "custom" : tier.toUpperCase();
}

/** Elapsed wall time for a row; running runs read the current tick. */
function duration(run: Run, now: number): string {
  if (run.started === null) return "";
  const end = run.ended ?? (run.status === "running" ? now : run.started);
  return fmtMs(end - run.started);
}

/** A running row ticks its elapsed time once a second on its own, so the rest
 *  of the list neither re-renders nor re-sorts every second. */
function LiveDuration({ run }: { run: Run }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{duration(run, now)}</>;
}

// Stable empty array so `useStore` never sees a fresh snapshot reference.
const EMPTY_RUNS: Run[] = [];

export function RunList() {
  const sessions = useStore((s) => s.sessions);
  const selectedSession = useStore((s) => s.selectedSession);
  const selectedRun = useStore((s) => s.selectedRun);
  const view = useStore((s) => s.view);
  const tiers = useStore((s) => s.stats?.tiers ?? null);
  const runsBySession = useStore((s) => s.runsBySession);
  const runs = selectedSession
    ? (runsBySession[selectedSession] ?? EMPTY_RUNS)
    : EMPTY_RUNS;

  const ordered = runs.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const session = sessions.find((s) => s.id === selectedSession) ?? null;

  // `ago` only needs a slow tick; running rows use LiveDuration for seconds.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the selected row in view when it changes via keyboard.
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!selectedRun) return;
    rowRefs.current[selectedRun]?.scrollIntoView({ block: "nearest" });
  }, [selectedRun]);

  const openRun = (run: Run) => {
    selectRun(run.id);
    navigate({ name: "run", runId: run.id, sub: null });
  };

  const move = (delta: number) => {
    if (ordered.length === 0) return;
    const index = ordered.findIndex((run) => run.id === selectedRun);
    const start = index < 0 ? (delta > 0 ? -1 : ordered.length) : index;
    const next = Math.max(0, Math.min(ordered.length - 1, start + delta));
    openRun(ordered[next]);
  };

  useKeys({
    j: () => move(1),
    k: () => move(-1),
    Enter: () => {
      if (ordered.length === 0) return;
      const current = ordered.find((run) => run.id === selectedRun) ?? ordered[0];
      openRun(current);
    },
    Escape: () => {
      if (selectedSession) navigate({ name: "session", sessionId: selectedSession });
      else navigate({ name: "home" });
    },
    g: () => setView(view === "tree" ? "list" : "tree"),
  });

  const cwds = session?.cwds ?? [];
  const title = session ? session.title || session.id : "Runs";

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-15 font-semibold tracking-[-0.01em] text-fg">
            {title}
          </h2>
          <div
            role="group"
            aria-label="Runs view"
            className="inline-flex h-7 shrink-0 items-center rounded-6 border border-line p-0.5"
          >
            {(["list", "tree"] as const).map((mode) => {
              const active = view === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  title={`${mode === "list" ? "List" : "Tree"} view (g)`}
                  onClick={() => setView(mode)}
                  className={[
                    "h-6 rounded-[4px] px-2.5 text-11 capitalize transition-colors duration-150",
                    active ? "bg-hover text-fg" : "text-fg3 hover:text-fg",
                  ].join(" ")}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
        {cwds.length > 0 ? (
          <p className="mt-1 truncate font-mono text-11 text-fg3">
            {cwds.map(shortPath).join("  ·  ")}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col">
        {ordered.map((run) => {
          const selected = run.id === selectedRun;
          const tier = tierOf(run.model, tiers);
          const meta: ReactNode[] = [
            run.model || null,
            run.status === "running" ? (
              <LiveDuration key="duration" run={run} />
            ) : (
              duration(run, now) || null
            ),
            run.cost > 0 ? fmtCost(run.cost) : null,
          ].filter((part) => part !== null && part !== "");

          return (
            <button
              key={run.id}
              type="button"
              ref={(el) => {
                rowRefs.current[run.id] = el;
              }}
              onClick={() => openRun(run)}
              className={[
                "relative flex h-[60px] w-full flex-col justify-center gap-0.5 border-b border-line px-4 text-left transition-colors duration-150",
                selected ? "bg-hover" : "hover:bg-hover",
              ].join(" ")}
            >
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-0.5 bg-fg"
                />
              ) : null}

              <span className="flex min-w-0 items-center gap-2">
                <Glyph status={run.status} />
                <span className="min-w-0 flex-1 truncate text-13 font-medium tracking-[-0.01em] text-fg">
                  {run.title || run.id}
                </span>
                <Pill mono>{tierLabel(tier)}</Pill>
                <span className="shrink-0 text-11 text-fg4">
                  {ago(run.ended ?? run.started ?? run.created, now)}
                </span>
              </span>

              <span className="truncate text-11 text-fg3">
                {meta.map((part, index) => (
                  <Fragment key={index}>
                    {index > 0 ? " · " : ""}
                    {part}
                  </Fragment>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
