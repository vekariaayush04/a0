// Run detail header: title, status/model/tier/started pills, elapsed ticker
// and a Cancel button for active runs. Memoized so live log events do not
// re-render it; the elapsed ticker lives inside this component.

import { memo, useState } from "react";
import { cancelRun } from "../../api/client";
import type { Run } from "../../api/types";
import { fmtMs, tierLabel } from "../../lib/format";
import { useStore } from "../../state/store";
import { Glyph } from "../../ui/Glyph";
import { Pill } from "../../ui/Pill";
import { isTerminal } from "./derive";
import { useNow } from "./hooks";

function clockTime(ts: number | null): string | null {
  if (ts === null) return null;
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export type HeaderProps = {
  run: Run | null;
  onRun: (run: Run) => void;
};

export const Header = memo(function Header({ run, onRun }: HeaderProps) {
  const tiers = useStore((store) => store.stats?.tiers);
  const [cancelling, setCancelling] = useState(false);

  const active = run?.status === "running" || run?.status === "queued";
  const now = useNow(run?.status === "running");

  if (!run) return null;

  const running = run.status === "running";
  const started = clockTime(run.started);
  const elapsedEnd = run.ended ?? (running ? now : null);
  const elapsed =
    run.started !== null && elapsedEnd !== null
      ? fmtMs(elapsedEnd - run.started)
      : null;
  const tier = tierLabel(run.model, tiers);

  const onCancel = async () => {
    if (!active || cancelling) return;
    if (!window.confirm(`Cancel run “${run.title}”?`)) return;
    setCancelling(true);
    try {
      const next = await cancelRun(run.id);
      onRun(next);
    } catch {
      /* the status stream may still settle the run */
    } finally {
      setCancelling(false);
    }
  };

  return (
    <header className="border-b border-line px-4 pb-4 pt-4">
      <h1 className="text-26 font-semibold tracking-[-0.02em] text-fg">
        {run.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-11 text-fg2">
        <Pill title={`status: ${run.status}`}>
          <span className="flex items-center gap-1">
            <Glyph status={run.status} size={10} />
            <span>{run.status}</span>
          </span>
        </Pill>

        {run.model || run.provider ? (
          <span className="font-mono text-11 text-fg2" title={run.provider}>
            {run.model || run.provider}
          </span>
        ) : null}

        <Pill mono>{tier}</Pill>

        {started ? <span>started {started}</span> : null}

        {elapsed !== null ? (
          <span className={running ? "text-accent" : "text-fg2"}>
            {elapsed}
          </span>
        ) : null}

        {!isTerminal(run.status) ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="ml-auto inline-flex h-7 items-center rounded-6 border border-line px-2 text-11 text-fg2 transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : null}
      </div>
    </header>
  );
});
