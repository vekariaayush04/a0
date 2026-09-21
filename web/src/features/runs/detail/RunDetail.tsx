// Run detail pane. Single parent for the run: it owns the run fetch, the one
// per-run SSE subscription and the one incremental log fold, then hands each
// leaf the smallest slice of state it needs.
//
// Derivation is streaming: `foldLogEvent` folds each frame into a mutable
// accumulator (open-tool map + entries + brief) instead of re-scanning the
// whole event history on every render. Dedupe uses cheap per-event identities,
// never a full JSON stringify. The accumulator is reset only on run switch and
// on reconnect replay.
//
// Composition, top to bottom: Header, Timeline strip, Tabs (Log | Brief |
// Result), StatsStrip. Only the tab body scrolls.

import { useCallback, useEffect, useRef, useState } from "react";

import { getRun } from "@/api/client";
import { useRunEvents } from "@/api/sse";
import type { PiEvent, Run } from "@/api/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createLogState,
  foldLogEvent,
  isTerminal,
  type LogState,
} from "@/features/runs/derive";
import { useStore } from "@/state/store";
import { Header } from "./Header";
import { Log } from "./Log";
import { Prose } from "./Prose";
import { StatsStrip } from "./StatsStrip";
import { Timeline } from "./Timeline";

export function RunDetail() {
  const runId = useStore((store) => store.selectedRun);
  const [run, setRunState] = useState<Run | null>(null);

  // Mutable derivation buffer. `logVersion` is the render signal: bumped
  // whenever a fold actually changed a visible entry.
  const logRef = useRef<LogState | null>(null);
  const [logVersion, setLogVersion] = useState(0);

  // Reset synchronously on run switch so we never paint the previous run.
  const activeRunId = useRef(runId);
  if (activeRunId.current !== runId) {
    activeRunId.current = runId;
    logRef.current = createLogState();
  }
  if (!logRef.current) logRef.current = createLogState();

  const resetLog = useCallback(() => {
    logRef.current = createLogState();
    setLogVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    setRunState(null);
    if (!runId) return;
    let cancelled = false;
    getRun(runId)
      .then((next) => {
        if (!cancelled) setRunState(next);
      })
      .catch(() => {
        /* the run may have vanished; the status stream can still settle it */
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const ingest = useCallback((event: PiEvent) => {
    if (foldLogEvent(logRef.current ?? (logRef.current = createLogState()), event)) {
      setLogVersion((version) => version + 1);
    }
  }, []);

  useRunEvents<PiEvent, Run>(runId, ingest, setRunState, resetLog);

  const entries = logRef.current.entries;
  const brief = logRef.current.brief;
  const onRun = useCallback((next: Run) => setRunState(next), []);

  if (!runId && !run) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-13 font-medium text-foreground">No run selected</p>
        <p className="mt-1.5 text-11 text-muted-foreground">
          Choose a run to see its timeline and log.
        </p>
      </div>
    );
  }

  const terminal = run ? isTerminal(run.status) : false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header run={run} onRun={onRun} />
      <Timeline entries={entries} version={logVersion} run={run} />

      <Tabs defaultValue="log" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-5 py-2">
          <TabsList className="h-7 bg-muted p-0.5">
            <TabsTrigger value="log" className="h-6 px-2.5 text-11">
              Log
            </TabsTrigger>
            <TabsTrigger value="brief" className="h-6 px-2.5 text-11">
              Brief
            </TabsTrigger>
            <TabsTrigger value="result" className="h-6 px-2.5 text-11">
              Result
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="log" className="mt-0 min-h-0 flex-1 outline-none">
          <Log entries={entries} terminal={terminal} version={logVersion} />
        </TabsContent>
        <TabsContent value="brief" className="mt-0 min-h-0 flex-1 outline-none">
          <Prose text={brief} empty="No brief captured for this run." />
        </TabsContent>
        <TabsContent value="result" className="mt-0 min-h-0 flex-1 outline-none">
          <Prose
            text={run?.result ?? ""}
            empty={terminal ? "This run recorded no result." : "The result arrives when the run finishes."}
          />
        </TabsContent>
      </Tabs>

      <StatsStrip run={run} />
    </div>
  );
}

export default RunDetail;
