/// <reference types="bun" />
// Tests for the incremental log derivation used by RunDetail.
// Run with: bun test web/src/components/RunDetail/derive.test.ts

import { test, expect } from "bun:test";
import type { PiEvent } from "../../api/types";
import {
  createLogState,
  deriveLog,
  foldLogEvent,
  type LogState,
} from "./derive";

function foldAll(events: PiEvent[]): LogState {
  const state = createLogState();
  for (const event of events) foldLogEvent(state, event);
  return state;
}

const events: PiEvent[] = [
  {
    type: "message_end",
    ts: 1,
    message: {
      role: "user",
      content: [{ type: "text", text: "make a file" }],
    },
  },
  {
    type: "tool_execution_start",
    ts: 2,
    toolCallId: "a",
    toolName: "write",
    args: { file_path: "hello.txt" },
  },
  {
    type: "message_end",
    ts: 3,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    },
  },
  {
    type: "tool_execution_end",
    ts: 4,
    toolCallId: "a",
    toolName: "write",
    result: "ok",
    isError: false,
  },
];

test("incremental fold matches the one-shot deriveLog for ordered events", () => {
  const state = foldAll(events);
  expect(JSON.stringify(state.entries)).toBe(JSON.stringify(deriveLog(events)));
});

test("brief is captured from the first user message", () => {
  expect(foldAll(events).brief).toBe("make a file");
});

test("a tool end fills in the row opened by its start", () => {
  const state = foldAll(events);
  const tool = state.entries.find((entry) => entry.kind === "tool");
  expect(tool).toBeDefined();
  if (tool?.kind === "tool") {
    expect(tool.result).toBe("ok");
    expect(tool.startTs).toBe(2);
    expect(tool.endTs).toBe(4);
  }
});

test("folding the same event twice is a no-op", () => {
  const state = createLogState();
  expect(foldLogEvent(state, events[0])).toBe(true);
  expect(foldLogEvent(state, events[0])).toBe(false);
  expect(state.brief).toBe("make a file");
  expect(state.entries.length).toBe(0);
});

test("a duplicate tool frame does not open a second row", () => {
  const state = createLogState();
  foldLogEvent(state, events[1]);
  foldLogEvent(state, events[1]);
  const tools = state.entries.filter((entry) => entry.kind === "tool");
  expect(tools.length).toBe(1);
});

test("an unmatched tool end still becomes a resolved row", () => {
  const state = createLogState();
  foldLogEvent(state, events[3]);
  const tool = state.entries[0];
  expect(tool.kind).toBe("tool");
  if (tool.kind === "tool") {
    expect(tool.startTs).toBeNull();
    expect(tool.endTs).toBe(4);
  }
});
