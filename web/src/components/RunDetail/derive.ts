// Pure derivations from the raw Pi event stream. Timeline, Log and Brief all
// build from the same `deriveLog` output so entry ids line up (Timeline chips
// scroll the matching log row into view).

import type {
  PiEvent,
  PiMessageEndEvent,
  PiToolEndEvent,
  PiToolStartEvent,
  Run,
  Status,
} from "../../api/types";

export type LogEntry =
  | { kind: "assistant"; id: string; ts: number | null; text: string }
  | {
      kind: "tool";
      id: string;
      toolCallId: string;
      name: string;
      target: string;
      args: unknown;
      result: unknown;
      isError: boolean;
      startTs: number | null;
      endTs: number | null;
    }
  | { kind: "error"; id: string; ts: number | null; text: string };

export function isTerminal(status: Status | string | undefined): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

/** DOM id for a log entry, sanitized so `getElementById` can find it. */
export function logDomId(id: string): string {
  return `log-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function messageText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      out += (part as { text: string }).text;
    }
  }
  return out;
}

/** First line of a tool argument, trimmed for chip/row labels. */
export function firstLine(value: string, max = 80): string {
  const line = (value.split(/\r?\n/, 1)[0] ?? "").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Best-effort human target for a tool call. */
export function toolTarget(args: unknown): string {
  if (typeof args === "string") return firstLine(args);
  if (args && typeof args === "object") {
    const record = args as Record<string, unknown>;
    for (const key of [
      "file_path",
      "filePath",
      "path",
      "command",
      "cmd",
      "pattern",
      "query",
      "url",
      "target",
      "name",
    ]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return firstLine(value.trim());
    }
  }
  return "";
}

/** JSON for a tool body, capped so one huge result cannot blow up the DOM. */
export function stringifyCapped(
  value: unknown,
  cap = 4000,
): { text: string; truncated: boolean } {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (value === undefined || value === null) {
    text = "";
  } else {
    try {
      text = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  if (text.length > cap) return { text: text.slice(0, cap), truncated: true };
  return { text, truncated: false };
}

function toolId(toolCallId: string | undefined, index: number): string {
  return toolCallId ? `tool-${toolCallId}` : `tool-${index}`;
}

/** Incremental derivation state. `openTools` maps a tool call id to the index
 *  of its entry so a later `tool_execution_end` can fill in the result without
 *  re-scanning the stream. `seen` holds cheap per-event identities so a replay
 *  or an overlapping connection cannot fold the same frame twice. */
export type LogState = {
  entries: LogEntry[];
  openTools: Map<string, number>;
  seen: Set<string>;
  brief: string;
  seq: number;
};

export function createLogState(): LogState {
  return {
    entries: [],
    openTools: new Map(),
    seen: new Set(),
    brief: "",
    seq: 0,
  };
}

/** Cheap identity for dedupe: tool frames key on id+type, everything else on
 *  type+timestamp. Avoids stringifying whole events on every frame. */
export function eventIdentity(event: PiEvent): string | null {
  if (
    event.type === "tool_execution_start" ||
    event.type === "tool_execution_end"
  ) {
    const toolCallId = (event as { toolCallId?: unknown }).toolCallId;
    if (typeof toolCallId === "string" && toolCallId) {
      return `${event.type}:${toolCallId}`;
    }
  }
  const ts = (event as { ts?: unknown }).ts;
  return typeof ts === "number" ? `${event.type}:${ts}` : null;
}

/** Fold one event into the derivation state. Mutates `state` in place and
 *  returns true when it produced a visible change (a new/updated log entry or
 *  the brief), so the caller only re-renders when something actually changed.
 *  Idempotent: folding the same event twice is a no-op. */
export function foldLogEvent(state: LogState, event: PiEvent): boolean {
  const key = eventIdentity(event);
  if (key !== null) {
    if (state.seen.has(key)) return false;
    state.seen.add(key);
  }

  const index = state.seq++;
  const ts = typeof event.ts === "number" ? event.ts : null;

  if (event.type === "message_end") {
    const message = (event as PiMessageEndEvent).message;
    if (message?.role === "user") {
      if (state.brief) return false;
      const text = messageText(message.content);
      if (!text) return false;
      state.brief = text;
      return true;
    }
    if (message?.role !== "assistant") return false;

    let changed = false;
    const errored =
      message.stopReason === "error" || Boolean(message.errorMessage);
    if (errored) {
      state.entries.push({
        kind: "error",
        id: `err-${index}`,
        ts,
        text: String(message.errorMessage ?? message.stopReason ?? "run error"),
      });
      changed = true;
    }
    const text = messageText(message.content);
    if (text) {
      state.entries.push({ kind: "assistant", id: `msg-${index}`, ts, text });
      changed = true;
    }
    return changed;
  }

  if (event.type === "tool_execution_start") {
    const start = event as PiToolStartEvent;
    if (start.toolCallId) {
      state.openTools.set(start.toolCallId, state.entries.length);
    }
    state.entries.push({
      kind: "tool",
      id: toolId(start.toolCallId, index),
      toolCallId: start.toolCallId ?? "",
      name: start.toolName ?? "tool",
      target: toolTarget(start.args),
      args: start.args,
      result: undefined,
      isError: false,
      startTs: ts,
      endTs: null,
    });
    return true;
  }

  if (event.type === "tool_execution_end") {
    const end = event as PiToolEndEvent;
    const openIndex = end.toolCallId
      ? state.openTools.get(end.toolCallId)
      : undefined;
    if (openIndex !== undefined) {
      const open = state.entries[openIndex];
      if (open && open.kind === "tool") {
        state.entries[openIndex] = {
          ...open,
          result: end.result,
          isError: end.isError === true,
          endTs: ts,
        };
        if (end.toolCallId) state.openTools.delete(end.toolCallId);
        return true;
      }
    }
    // An end without a matching start still becomes a row (its start was
    // dropped); mark it resolved so it does not render as perpetually running.
    state.entries.push({
      kind: "tool",
      id: toolId(end.toolCallId, index),
      toolCallId: end.toolCallId ?? "",
      name: end.toolName ?? "tool",
      target: "",
      args: undefined,
      result: end.result,
      isError: end.isError === true,
      startTs: null,
      endTs: ts,
    });
    return true;
  }

  return false;
}

/** Ordered log entries: assistant text, paired tool calls, error blocks.
 *  Thinking content and user messages are skipped (the brief is rendered
 *  separately). Tool rows are emitted at their start position and carry the
 *  result once the matching end event arrives. */
export function deriveLog(events: PiEvent[]): LogEntry[] {
  const starts = new Map<string, PiToolStartEvent>();
  const ends = new Map<string, PiToolEndEvent>();
  for (const event of events) {
    if (event.type === "tool_execution_start") {
      const start = event as PiToolStartEvent;
      if (start.toolCallId) starts.set(start.toolCallId, start);
    } else if (event.type === "tool_execution_end") {
      const end = event as PiToolEndEvent;
      if (end.toolCallId) ends.set(end.toolCallId, end);
    }
  }

  const entries: LogEntry[] = [];
  const emitted = new Set<string>();

  events.forEach((event, index) => {
    if (event.type === "message_end") {
      const message = (event as PiMessageEndEvent).message;
      if (message?.role !== "assistant") return;
      const errored =
        message.stopReason === "error" || Boolean(message.errorMessage);
      if (errored) {
        entries.push({
          kind: "error",
          id: `err-${index}`,
          ts: typeof event.ts === "number" ? event.ts : null,
          text: String(message.errorMessage ?? message.stopReason ?? "run error"),
        });
      }
      const text = messageText(message.content);
      if (text) {
        entries.push({
          kind: "assistant",
          id: `msg-${index}`,
          ts: typeof event.ts === "number" ? event.ts : null,
          text,
        });
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      const start = event as PiToolStartEvent;
      const id = toolId(start.toolCallId, index);
      if (emitted.has(id)) return;
      emitted.add(id);
      const end = start.toolCallId ? ends.get(start.toolCallId) : undefined;
      entries.push({
        kind: "tool",
        id,
        toolCallId: start.toolCallId ?? "",
        name: start.toolName ?? "tool",
        target: toolTarget(start.args),
        args: start.args,
        result: end?.result,
        isError: end?.isError === true,
        startTs: typeof start.ts === "number" ? start.ts : null,
        endTs: end && typeof end.ts === "number" ? end.ts : null,
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      const end = event as PiToolEndEvent;
      const id = toolId(end.toolCallId, index);
      if (emitted.has(id)) return;
      emitted.add(id);
      entries.push({
        kind: "tool",
        id,
        toolCallId: end.toolCallId ?? "",
        name: end.toolName ?? "tool",
        target: "",
        args: undefined,
        result: end.result,
        isError: end.isError === true,
        startTs: null,
        endTs: typeof end.ts === "number" ? end.ts : null,
      });
    }
  });

  return entries;
}

/** First user message text, shown in the collapsible Brief. */
export function briefText(events: PiEvent[]): string {
  for (const event of events) {
    if (event.type !== "message_end") continue;
    const message = (event as PiMessageEndEvent).message;
    if (message?.role !== "user") continue;
    const text = messageText(message.content);
    if (text) return text;
  }
  return "";
}

/** Resolve a model name to its L1/L2/L3 tier label using /api/stats. */

/** Duration between two epoch-ms timestamps, or null if either is missing. */
export function durationBetween(
  start: number | null,
  end: number | null,
): number | null {
  if (start === null || end === null) return null;
  return Math.max(0, end - start);
}

export function runDuration(run: Run, now: number): number | null {
  if (run.started === null) return null;
  if (run.ended !== null) return Math.max(0, run.ended - run.started);
  if (run.status === "running") return Math.max(0, now - run.started);
  return null;
}
