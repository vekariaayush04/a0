import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, cpSync, copyFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { Store } from "../src/daemon/store"; import { Bus } from "../src/daemon/bus"; import { Runner } from "../src/daemon/runner"; import { startServer } from "../src/daemon/server";

let url: string, server: any, home: string, runner: Runner;
const tiers = { l1: "muse-spark-1.3-contributor", l2: "deepseek-v4.1-flash", l3: "glm-5.3" };
const defaults = { provider: "opencode-go", model: "deepseek-v4.1-flash", thinking: "high" };
const fixtureRun = join(import.meta.dir, "fixtures/tree/run");

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "sentinel-tree-")); const store = new Store(":memory:"); const bus = new Bus();
  runner = new Runner(store, bus, { home, piBin: join(import.meta.dir, "fake-pi/pi"), concurrency: 2, timeout: 60 });
  server = startServer({ store, runner, bus, port: 0, uiPath: join(import.meta.dir, "../src/ui/index.html"), tiers, defaults });
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));
const post = (p: string, b: any) => fetch(url + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

/** Creates a run through the real pipeline, waits for it to finish, then overlays the sample-run fixture's events.jsonl and subagent-artifacts onto its run dir so it has real spawn-tree data to serve. */
async function seededDoneRun(sessionId: string): Promise<string> {
  const run = await (await post("/api/runs", { sessionId, cwd: home, title: "tree fixture", brief: "hi" })).json();
  await (await fetch(`${url}/api/runs/${run.id}/wait?timeout=5`)).json();
  const dir = runner.runDir(run.id);
  copyFileSync(join(fixtureRun, "events.jsonl"), join(dir, "events.jsonl"));
  mkdirSync(join(dir, "pi-session", "subagent-artifacts"), { recursive: true });
  cpSync(join(fixtureRun, "pi-session/subagent-artifacts"), join(dir, "pi-session/subagent-artifacts"), { recursive: true });
  return run.id;
}

test("GET /api/runs/:id/tree: 1 scout child, cost>0, turns 4, done, tools present on both levels", async () => {
  const id = await seededDoneRun("tree-s1");
  const tree = await (await fetch(`${url}/api/runs/${id}/tree`)).json();
  expect(tree.kind).toBe("run");
  expect(tree.id).toBe(id);
  expect(tree.children).toHaveLength(1);
  const child = tree.children[0];
  expect(child.agent).toBe("scout");
  expect(child.status).toBe("done");
  expect(child.cost).toBeGreaterThan(0);
  expect(child.turns).toBe(4);
  expect(child.tools.length).toBeGreaterThanOrEqual(1);
  expect(tree.tools.some((t: any) => t.name === "write")).toBe(true);
});

test("GET /api/runs/:id/tree: 404 for unknown run", async () => {
  expect((await fetch(`${url}/api/runs/nope/tree`)).status).toBe(404);
});

test("GET /api/runs/:id/tree: a run with no subagent-artifacts dir yields children: []", async () => {
  const run = await (await post("/api/runs", { sessionId: "tree-s1", cwd: home, title: "no-subagents", brief: "hi" })).json();
  await (await fetch(`${url}/api/runs/${run.id}/wait?timeout=5`)).json();
  const tree = await (await fetch(`${url}/api/runs/${run.id}/tree`)).json();
  expect(tree.children).toEqual([]);
});

test("GET /api/sessions/:id/tree: stacks runs in created order", async () => {
  const r1 = await (await post("/api/runs", { sessionId: "tree-s2", cwd: home, title: "first", brief: "a" })).json();
  await (await fetch(`${url}/api/runs/${r1.id}/wait?timeout=5`)).json();
  const r2 = await (await post("/api/runs", { sessionId: "tree-s2", cwd: home, title: "second", brief: "b" })).json();
  await (await fetch(`${url}/api/runs/${r2.id}/wait?timeout=5`)).json();
  const tree = await (await fetch(`${url}/api/sessions/tree-s2/tree`)).json();
  expect(tree.kind).toBe("session");
  expect(tree.id).toBe("tree-s2");
  expect(tree.children.map((c: any) => c.id)).toEqual([r1.id, r2.id]);
});

test("GET /api/sessions/:id/tree: 404 for unknown session", async () => {
  expect((await fetch(`${url}/api/sessions/nope/tree`)).status).toBe(404);
});

test("GET /api/runs/:id/subagents/:index/transcript: input/output text and >=1 tool record", async () => {
  const id = await seededDoneRun("tree-s3");
  const t = await (await fetch(`${url}/api/runs/${id}/subagents/0/transcript`)).json();
  expect(t.agent).toBe("scout");
  expect(t.input).toContain("Task for scout");
  expect(t.output).toContain("fib.py");
  expect(t.records.length).toBeGreaterThan(0);
  expect(t.records.some((r: any) => r.tool)).toBe(true);
});

test("GET /api/runs/:id/subagents/:index/transcript: 404 for unknown run and unknown index", async () => {
  expect((await fetch(`${url}/api/runs/nope/subagents/0/transcript`)).status).toBe(404);
  const id = await seededDoneRun("tree-s4");
  expect((await fetch(`${url}/api/runs/${id}/subagents/9/transcript`)).status).toBe(404);
});
