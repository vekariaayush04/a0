/// <reference types="bun" />
// Unit tests for the pure tree layout. Run with:
//   bun test web/src/components/Tree/layout.test.ts

import { test, expect } from "bun:test";
import { layoutSession } from "./layout";
import benchJson from "./__fixtures__/bench.json";
import type { RunTree, SessionTree, SubagentNode } from "../../api/types";

function run(patch: Partial<RunTree> = {}): RunTree {
  return {
    kind: "run",
    id: "r1",
    title: "a run",
    status: "done",
    model: "deepseek-v4.1-flash",
    tier: "l2",
    cost: 0.001,
    started: 1000,
    ended: 6000,
    tools: [],
    children: [],
    ...patch,
  };
}

function sub(patch: Partial<SubagentNode> = {}): SubagentNode {
  return {
    kind: "subagent",
    id: "s1",
    index: 0,
    agent: "scout",
    model: "muse-spark",
    task: "look around",
    status: "done",
    cost: 0.0004,
    turns: 2,
    started: 2000,
    ended: 4000,
    spawnedAt: 1500,
    tools: [],
    children: [],
    ...patch,
  };
}

function session(children: RunTree[], patch: Partial<SessionTree> = {}): SessionTree {
  return {
    kind: "session",
    id: "sess",
    title: "session",
    runCount: children.length,
    totalCost: 0,
    children,
    ...patch,
  };
}

test("single run: session card and run node, run below the session", () => {
  const layout = layoutSession(session([run()]));
  const sessionNode = layout.nodes.find((n) => n.kind === "session");
  const runNode = layout.nodes.find((n) => n.kind === "run");
  expect(sessionNode).toBeDefined();
  expect(runNode).toBeDefined();
  expect(runNode!.w).toBe(220);
  expect(runNode!.h).toBe(54);
  expect(runNode!.y).toBeGreaterThan(sessionNode!.y);
  expect(layout.axisTicks.length).toBeGreaterThan(0);
});

test("two overlapping runs get separate columns", () => {
  const layout = layoutSession(
    session([
      run({ id: "a", started: 1000, ended: 8000 }),
      run({ id: "b", started: 2000, ended: 9000 }),
    ]),
  );
  const a = layout.nodes.find((n) => n.id === "run:a")!;
  const b = layout.nodes.find((n) => n.id === "run:b")!;
  expect(a.x).not.toBe(b.x);
  expect(Math.abs(a.x - b.x)).toBe(220 + 24);
});

test("subagent nests under its parent at spawnedAt", () => {
  const layout = layoutSession(
    session([run({ id: "r", started: 1000, ended: 10000, children: [sub()] })]),
  );
  const parent = layout.nodes.find((n) => n.id === "run:r")!;
  const child = layout.nodes.find((n) => n.kind === "subagent")!;
  expect(child).toBeDefined();
  expect(child.runId).toBe("r");
  expect(child.index).toBe(0);
  expect(child.x).toBeGreaterThan(parent.x);
  expect(child.y).toBeGreaterThan(parent.y);
  const edge = layout.edges.find((e) => e.to === child.id)!;
  expect(edge.from).toBe(parent.id);
});

test("bench fixture: the scout subagent is below its parent run", () => {
  const tree = benchJson as unknown as SessionTree;
  const layout = layoutSession(tree);
  // The fixture's "Probe: subagent fan-out" run has exactly one subagent.
  const parent = layout.nodes.find(
    (n) => n.kind === "run" && (n.ref as RunTree).id === "0mu04ukjirto2",
  )!;
  expect(parent).toBeDefined();
  const child = layout.nodes.find(
    (n) => n.kind === "subagent" && n.runId === "0mu04ukjirto2",
  )!;
  expect(child).toBeDefined();
  expect(child.y).toBeGreaterThan(parent.y);
});
