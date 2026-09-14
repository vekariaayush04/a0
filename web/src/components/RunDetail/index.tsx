// Run detail pane. This is the single parent for the run: it owns the run
// fetch, the one per-run SSE subscription and the one `deriveLog` pass, then
// hands each leaf the smallest slice of state it needs. Leaves are pure and
// mostly memoized, so a streaming event only re-renders the Timeline and Log.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRun } from "../../api/client";
import { useRunEvents } from "../../api/sse";
import type { PiEvent, Run } from "../../api/types";
import { useStore } from "../../state/store";
import { Empty } from "../../ui/Empty";
import { Brief } from "./Brief";
import { briefText, deriveLog, isTerminal } from "./derive";
import { Header } from "./Header";
import { Log } from "./Log";
import { StatsStrip } from "./StatsStrip";
import { Timeline } from "./Timeline";

function eventKey(event: PiEvent): string | null {
  try {
    return JSON.stringify(event);
  } catch {
    return null;
  }
}

export function RunDetail() {
  const runId = useStore((store) => store.selectedRun);
  const [run, setRunState] = useState<Run | null>(null);
  const [events, setEvents] = useState<PiEvent[]>([]);
  // Dedupe identical replayed frames so a StrictMode remount or a reconnect
  // replay cannot append the same event twice.
  const seen = useRef<Set<string>>(new Set());

  // Reset and re-fetch whenever the selected run changes.
  useEffect(() => {
    seen.current = new Set();
    setRunState(null);
    setEvents([]);
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
    const key = eventKey(event);
    if (key !== null) {
      if (seen.current.has(key)) return;
      seen.current.add(key);
    }
    setEvents((current) => [...current, event]);
  }, []);

  useRunEvents<PiEvent, Run>(
    runId,
    ingest,
    (next) => setRunState(next),
    () => {
      seen.current = new Set();
      setEvents([]);
    },
  );

  const entries = useMemo(() => deriveLog(events), [events]);
  const brief = useMemo(() => briefText(events), [events]);
  const onRun = useCallback((next: Run) => setRunState(next), []);

  if (!runId && !run) {
    return <Empty title="Select a run" hint="Choose a run to see its log." />;
  }

  return (
    <div className="flex h-full flex-col">
      <Header run={run} onRun={onRun} />
      <Brief text={brief} />
      <Timeline entries={entries} run={run} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Log entries={entries} terminal={run ? isTerminal(run.status) : false} />
      </div>
      <StatsStrip run={run} />
    </div>
  );
}

export default RunDetail;
