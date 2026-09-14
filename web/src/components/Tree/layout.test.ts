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

test("running run extent grows with now and covers its unmatched tool tick", () => {
  const tree = session([
    run({
      id: "live",
      status: "running",
      started: 1000,
      ended: null,
      tools: [{ name: "bash", target: "ls", t0: 2000, t1: null, err: false }],
    }),
  ]);
  const early = layoutSession(tree, { now: 4000, pxPerMs: 0.01 });
  const late = layoutSession(tree, { now: 9000, pxPerMs: 0.01 });
  const earlyNode = early.nodes.find((n) => n.id === "run:live")!;
  const lateNode = late.nodes.find((n) => n.id === "run:live")!;
  expect(earlyNode.extent).not.toBeNull();
  expect(earlyNode.extent!.y2).toBeGreaterThan(earlyNode.extent!.y1);
  expect(lateNode.extent!.y2).toBeGreaterThan(earlyNode.extent!.y2);
  const tick = early.ticks.find((t) => t.nodeId === "run:live")!;
  expect(tick.y).toBeLessThanOrEqual(earlyNode.extent!.y2);
});

test("running subagent extent grows with now", () => {
  const tree = session([
    run({
      id: "r",
      status: "running",
      started: 1000,
      ended: null,
      children: [
        sub({ index: 0, status: "running", started: 2000, ended: null }),
      ],
    }),
  ]);
  const early = layoutSession(tree, { now: 4000, pxPerMs: 0.01 });
  const late = layoutSession(tree, { now: 9000, pxPerMs: 0.01 });
  const earlySub = early.nodes.find((n) => n.kind === "subagent")!;
  const lateSub = late.nodes.find((n) => n.kind === "subagent")!;
  expect(earlySub.extent).not.toBeNull();
  expect(lateSub.extent!.y2).toBeGreaterThan(earlySub.extent!.y2);
});

test("queued-only session places nodes in the queued band with finite y", () => {
  const layout = layoutSession(
    session([
      run({ id: "q1", status: "queued", started: null, ended: null }),
      run({ id: "q2", status: "queued", started: null, ended: null }),
    ]),
    { now: 9000 },
  );
  expect(layout.queuedTop).not.toBeNull();
  const q1 = layout.nodes.find((n) => n.id === "run:q1")!;
  const q2 = layout.nodes.find((n) => n.id === "run:q2")!;
  expect(q1.queued).toBe(true);
  expect(q2.queued).toBe(true);
  expect(Number.isFinite(q1.y)).toBe(true);
  expect(q1.y).toBeGreaterThanOrEqual(layout.queuedTop!);
  expect(q2.y).toBeGreaterThan(q1.y);
});

test("a run with an unmatched tool start is anchored at its start, not epoch 0", () => {
  const started = 1_700_000_000_000;
  const tree = session([
    run({
      id: "u",
      status: "done",
      started,
      ended: started + 3000,
      tools: [
        { name: "bash", target: "sleep", t0: started + 1000, t1: null, err: false },
      ],
    }),
  ]);
  const layout = layoutSession(tree, { now: started + 10000 });
  const node = layout.nodes.find((n) => n.id === "run:u")!;
  expect(layout.t0).toBe(started);
  expect(layout.t0).toBeGreaterThan(0);
  expect(node.y).toBe(layout.axisTop);
  const tick = layout.ticks.find((t) => t.nodeId === "run:u")!;
  expect(tick.y).toBeGreaterThan(node.extent!.y1);
  expect(tick.y).toBeLessThanOrEqual(node.extent!.y2);
});
