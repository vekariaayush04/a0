// Run detail data controller.
//
// App.tsx renders Header/Brief/Timeline/Log/StatsStrip as siblings without
// props, so the selected run and its live event stream live in this small
// module-level store rather than in a React context. Every leaf calls
// `useRunDetail()`; the first consumer to acquire becomes the "leader" and is
// the only one that opens the SSE connection, so there is exactly one fetch
// and one EventSource for the selected run. index.tsx composes the same
// leaves and calls the same hook.
//
// Reconnect safety: `useRunEvents` replays stored events on every new
// connection. We clear the accumulated log on `onReset` (the hook's second
// `open`), and we also dedupe identical replayed frames by their JSON so a
// StrictMode remount cannot double the log.

import { useEffect, useRef, useState } from "react";
import { getRun } from "../../api/client";
import { useRunEvents } from "../../api/sse";
import type { PiEvent, Run } from "../../api/types";
import { useStore } from "../../state/store";

export type RunDetailState = {
  runId: string | null;
  run: Run | null;
  events: PiEvent[];
  loaded: boolean;
  error: string | null;
};

const EMPTY: RunDetailState = {
  runId: null,
  run: null,
  events: [],
  loaded: false,
  error: null,
};

let state: RunDetailState = EMPTY;
const listeners = new Set<() => void>();
const consumers = new Set<symbol>();
let leader: symbol | null = null;
let activeRunId: string | null = null;
let fetchToken = 0;
let seen = new Set<string>();
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribeLocal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(patch: Partial<RunDetailState>): void {
  state = { ...state, ...patch };
  emit();
}

function resetFor(runId: string | null): void {
  activeRunId = runId;
  seen = new Set();
  const token = ++fetchToken;
  state = { runId, run: null, events: [], loaded: false, error: null };
  emit();
  if (!runId) return;
  getRun(runId)
    .then((run) => {
      if (token === fetchToken) publish({ run, loaded: true });
    })
    .catch((error: unknown) => {
      if (token === fetchToken) {
        publish({
          loaded: true,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
}

/** Append a live/replayed event for the run the stream belongs to. */
function ingest(event: PiEvent, expectedRunId: string): void {
  if (state.runId !== expectedRunId) return;
  const key = safeKey(event);
  if (key !== null) {
    if (seen.has(key)) return;
    seen.add(key);
  }
  publish({ events: [...state.events, event] });
}

function safeKey(event: PiEvent): string | null {
  try {
    return JSON.stringify(event);
  } catch {
    return null;
  }
}

function acquire(runId: string | null, consumer: symbol): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  consumers.add(consumer);
  if (runId !== activeRunId) resetFor(runId);
  if (leader === null || leader === undefined) {
    leader = consumer;
    emit();
  }
}

function release(consumer: symbol): void {
  consumers.delete(consumer);
  if (leader === consumer) {
    const next = consumers.values().next();
    leader = next.done ? null : next.value;
    emit();
  }
  if (consumers.size === 0) {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = null;
    if (leader === null || leader === undefined) {
      activeRunId = null;
      fetchToken += 1;
      state = EMPTY;
      seen = new Set();
      emit();
    }
  }
}

/** Re-render on a 1s cadence while `active`, for elapsed tickers. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Update the cached run (e.g. optimistically after a cancel). */
export function setRun(run: Run): void {
  if (state.runId === run.id) publish({ run });
}

/** The selected-run detail state. Safe to call from every leaf component. */
export function useRunDetail(): RunDetailState {
  const runId = useStore((store) => store.selectedRun);
  const [snap, setSnap] = useState<RunDetailState>(() => state);
  const consumerRef = useRef<symbol | null>(null);
  if (consumerRef.current === null) consumerRef.current = Symbol("run-detail");

  useEffect(() => {
    setSnap(state);
    return subscribeLocal(() => setSnap(state));
  }, []);

  useEffect(() => {
    const consumer = consumerRef.current;
    if (consumer === null) return;
    acquire(runId, consumer);
    return () => release(consumer);
  }, [runId]);

  const isLeader = leader === consumerRef.current;

  useRunEvents<PiEvent, Run>(
    isLeader ? runId : null,
    (event) => {
      if (isLeader && runId) ingest(event, runId);
    },
    (run) => {
      if (isLeader && state.runId === run.id) publish({ run });
    },
    () => {
      if (isLeader && runId && state.runId === runId) {
        seen = new Set();
        publish({ events: [] });
      }
    },
  );

  return snap;
}
