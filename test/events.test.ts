import { test, expect } from "bun:test";
import { parseLine, summarize } from "../src/daemon/events";
const load = async (f: string) => (await Bun.file(`test/fixtures/${f}`).text()).split("\n").map(parseLine).filter((e): e is NonNullable<typeof e> => !!e);

test("parseLine ignores junk", () => {
  expect(parseLine("")).toBeNull();
  expect(parseLine("not json")).toBeNull();
  expect(parseLine('{"type":"x"}')).toEqual({ type: "x" });
});

test("summarize ok run", async () => {
  const s = summarize(await load("ok.jsonl"));
  expect(s.piSessionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(s.result.toLowerCase()).toContain("pong");
  expect(s.outputTokens).toBeGreaterThan(0);
  expect(s.cost).toBeGreaterThan(0);
  expect(s.error).toBeUndefined();
});

test("summarize error run", async () => {
  const s = summarize(await load("error.jsonl"));
  expect(s.error).toContain("401");
  expect(s.result).toBe("");
});

test("summarize real pi run with tool calls", async () => {
  const events = await load("tools.jsonl");
  expect(events.some(e => e.type === "tool_execution_start")).toBe(true);
  const s = summarize(events);
  expect(s.result.length).toBeGreaterThan(0);
  expect(s.cost).toBeGreaterThan(0);
  expect(s.error).toBeUndefined();
});
