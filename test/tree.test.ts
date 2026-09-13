import { test, expect } from "bun:test";
import { join } from "node:path";
import { buildRunTree, readSubagentTranscript } from "../src/daemon/tree";
import type { Run } from "../src/daemon/store";

const tiers = { l1: "muse-spark-1.3-contributor", l2: "deepseek-v4.1-flash", l3: "glm-5.3" };
const runDir = join(import.meta.dir, "fixtures/tree/run");

function fakeRun(patch: Partial<Run> = {}): Run {
  return {
    id: "0mu04ukjirto2", sessionId: "s1", title: "scout demo", cwd: "/tmp/sentinel-demo",
    provider: "opencode-go", model: "opencode-go/deepseek-v4.1-flash", thinking: "high",
    status: "done", created: 1, started: 1789323225000, ended: 1789323241000,
    exitCode: 0, piSessionId: "01a09bf9-a882-75bd-b154-02125e2460f3", result: "done",
    inputTokens: 100, outputTokens: 50, cost: 0.01, error: null,
    ...patch,
  };
}

test("buildRunTree: one scout child with tools, cost, turns, status", () => {
  const tree = buildRunTree(fakeRun(), runDir, tiers);
  expect(tree.kind).toBe("run");
  expect(tree.tier).toBe("custom"); // model has no ":low" suffix match against tiers
  expect(tree.children).toHaveLength(1);
  const child = tree.children[0];
  expect(child.kind).toBe("subagent");
  expect(child.agent).toBe("scout");
  expect(child.status).toBe("done");
  expect(child.cost).toBeGreaterThan(0);
  expect(child.turns).toBe(4);
  expect(child.tools.length).toBeGreaterThanOrEqual(1);
  expect(child.tools.some(t => t.name === "read")).toBe(true);
  // parent's own tools include the spawn's write into subagent-artifacts/outputs is on the CHILD;
  // the parent run itself should show the subagent tool call at minimum.
  expect(tree.tools.some(t => t.name === "subagent")).toBe(true);
});

test("buildRunTree: spawn calls with args.action are ignored (only 1 child, not the list/models calls)", () => {
  const tree = buildRunTree(fakeRun(), runDir, tiers);
  expect(tree.children).toHaveLength(1);
  expect(tree.children[0].index).toBe(0);
});

test("buildRunTree: run with no subagent-artifacts dir yields children: []", () => {
  const emptyDir = join(import.meta.dir, "fixtures/tree/empty-run");
  const tree = buildRunTree(fakeRun({ id: "empty" }), emptyDir, tiers);
  expect(tree.children).toEqual([]);
});

test("readSubagentTranscript: input/output text and at least one tool record", () => {
  const t = readSubagentTranscript(runDir, 0);
  expect(t).not.toBeNull();
  expect(t!.agent).toBe("scout");
  expect(t!.input).toContain("Task for scout");
  expect(t!.output).toContain("fib.py");
  expect(t!.records.length).toBeGreaterThan(0);
  expect(t!.records.some(r => r.tool)).toBe(true);
});

test("readSubagentTranscript: unknown index returns null", () => {
  expect(readSubagentTranscript(runDir, 7)).toBeNull();
});
