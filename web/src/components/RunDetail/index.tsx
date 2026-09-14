// Run detail pane. This is the single parent for the run: it owns the run
// fetch, the one per-run SSE subscription and the one incremental log fold,
// then hands each leaf the smallest slice of state it needs.
//
// Derivation is streaming: `foldLogEvent` folds each frame into a mutable
// accumulator (open-tool map + entries + brief) instead of re-scanning the
// whole event history on every render. Dedupe uses cheap per-event identities
// (`toolCallId + type` or `type:ts`), never a full JSON stringify. The
// accumulator is reset only on run switch and on reconnect replay.

import { useCallback, useEffect, useRef, useState } from "react";
import { getRun } from "../../api/client";
import { useRunEvents } from "../../api/sse";
import type { PiEvent, Run } from "../../api/types";
import { useStore } from "../../state/store";
import { Empty } from "../../ui/Empty";
import { Brief } from "./Brief";
import {
  createLogState,
  foldLogEvent,
  isTerminal,
  type LogState,
} from "./derive";
import { Header } from "./Header";
import { Log } from "./Log";
import { StatsStrip } from "./StatsStrip";
import { Timeline } from "./Timeline";

export function RunDetail() {
  const runId = useStore((store) => store.selectedRun);
  const [run, setRunState] = useState<Run | null>(null);
  // Mutable derivation buffer. `logVersion` is the render signal: we bump it
  // whenever a fold actually changed a visible entry.
  const logRef = useRef<LogState | null>(null);
  const [logVersion, setLogVersion] = useState(0);
  // Reset the buffer synchronously when the run changes so we never render the
  // previous run's entries for a frame.
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

  // Re-fetch the run whenever the selection changes.
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
    return <Empty title="Select a run" hint="Choose a run to see its log." />;
  }

  return (
    <div className="flex h-full flex-col">
      <Header run={run} onRun={onRun} />
      <Brief text={brief} />
      <Timeline entries={entries} version={logVersion} run={run} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Log entries={entries} terminal={run ? isTerminal(run.status) : false} />
      </div>
      <StatsStrip run={run} />
    </div>
  );
}

export default RunDetail;
