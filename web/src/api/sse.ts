// SSE hooks backed by EventSource.
//
// The daemon replays stored events on every new connection, so when the
// browser reconnects (a second `open`) the caller must clear its accumulated
// log before the replay arrives: `onReset` runs at that point.

import { useEffect, useRef } from "react";
import type { Run } from "./types";

type Handler<T> = (data: T) => void;

export function useRunEvents<TEvent = unknown, TStatus = Run>(
  runId: string | null,
  onEvent: Handler<TEvent>,
  onStatus: Handler<TStatus>,
  onReset?: () => void,
) {
  const handlers = useRef({ onEvent, onStatus, onReset });
  handlers.current = { onEvent, onStatus, onReset };

  useEffect(() => {
    if (!runId) return;
    const url = `/api/runs/${encodeURIComponent(runId)}/events`;
    let source: EventSource | null = null;
    let opened = false;
    let disposed = false;

    source = new EventSource(url);
    source.addEventListener("open", () => {
      if (opened) handlers.current.onReset?.();
      opened = true;
    });
    source.addEventListener("event", (e) => {
      try {
        handlers.current.onEvent(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed frame */
      }
    });
    source.addEventListener("status", (e) => {
      try {
        handlers.current.onStatus(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed frame */
      }
    });
    source.addEventListener("done", () => {
      source?.close();
    });

    return () => {
      disposed = true;
      source?.close();
      source = null;
      void disposed;
    };
  }, [runId]);
}

export function useGlobalStatus<TStatus = Run>(onStatus: Handler<TStatus>) {
  const handler = useRef(onStatus);
  handler.current = onStatus;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("status", (e) => {
      try {
        handler.current(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed frame */
      }
    });
    return () => source.close();
  }, []);
}
