// Run detail header: title, status/model/tier/started, a live elapsed ticker,
// and a Cancel button guarded by an AlertDialog. Memoized so streaming log
// events never re-render it; only the ticker below re-renders each second.

import { memo, useState } from "react";

import { cancelRun } from "@/api/client";
import type { Run } from "@/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { isTerminal } from "@/features/runs/derive";
import { useNow } from "@/features/runs/hooks";
import { StatusBadge, TierBadge } from "@/features/runs/status";
import { fmtMs, shortPath, tierLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

function clockTime(ts: number | null): string | null {
  if (ts === null) return null;
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** One labelled fact in the header's meta row. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-11 text-muted-foreground">{label}</span>
      {children}
    </span>
  );
}

export type HeaderProps = {
  run: Run | null;
  onRun: (run: Run) => void;
};

export const Header = memo(function Header({ run, onRun }: HeaderProps) {
  const tiers = useStore((store) => store.stats?.tiers);
  const [cancelling, setCancelling] = useState(false);
  const running = run?.status === "running";
  const now = useNow(running);

  if (!run) return null;

  const started = clockTime(run.started);
  const elapsedEnd = run.ended ?? (running ? now : null);
  const elapsed =
    run.started !== null && elapsedEnd !== null ? fmtMs(elapsedEnd - run.started) : null;

  const onCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      onRun(await cancelRun(run.id));
    } catch {
      /* the status stream may still settle the run */
    } finally {
      setCancelling(false);
    }
  };

  return (
    <header className="shrink-0 border-b border-border px-5 pb-4 pt-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-20 font-semibold tracking-[-0.02em] text-foreground">
            {run.title || run.id}
          </h1>
          <p className="mt-0.5 truncate font-mono text-10 text-muted-foreground">
            {shortPath(run.cwd)}
          </p>
        </div>

        {!isTerminal(run.status) ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={cancelling}
                className="h-7 shrink-0 px-2.5 text-11"
              >
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-sm rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-15">Cancel this run?</AlertDialogTitle>
                <AlertDialogDescription className="text-12">
                  “{run.title || run.id}” will stop immediately. Work already
                  written to disk is kept; anything in flight is lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-8 text-12">Keep running</AlertDialogCancel>
                <AlertDialogAction onClick={onCancel} className="h-8 text-12">
                  Cancel run
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge status={run.status} />

        <Fact label="model">
          <span className="font-mono text-11 text-foreground" title={run.provider}>
            {run.model || run.provider || "—"}
          </span>
        </Fact>

        <TierBadge tier={tierLabel(run.model, tiers)} className="h-[18px]" />

        {started ? (
          <Fact label="started">
            <span className="font-mono text-11 tabular-nums text-foreground">
              {started}
            </span>
          </Fact>
        ) : null}

        {elapsed !== null ? (
          <Fact label="elapsed">
            <span
              className={cn(
                "font-mono text-11 tabular-nums",
                running ? "text-live" : "text-foreground",
              )}
            >
              {elapsed}
            </span>
          </Fact>
        ) : null}
      </div>
    </header>
  );
});
