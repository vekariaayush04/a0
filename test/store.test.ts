import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { Store, newRunId } from "../src/daemon/store";

test("run ids are sortable and short", async () => {
  const a = newRunId(); await Bun.sleep(2); const b = newRunId();
  expect(a < b).toBe(true); expect(a.length).toBeLessThanOrEqual(14);
});

test("sessions and runs", () => {
  const s = new Store(":memory:");
  const sess = s.touchSession("sess1", "/proj", undefined);
  expect(sess.title).toBe("proj");
  const r = s.createRun({ id: newRunId(), sessionId: "sess1", title: "t", cwd: "/proj", provider: "p", model: "m", thinking: "high" });
  expect(r.status).toBe("queued");
  s.updateRun(r.id, { status: "running", started: 5 });
  expect(s.getRun(r.id)!.status).toBe("running");
  expect(s.listRuns("sess1")).toHaveLength(1);
  expect(s.listSessions()[0].id).toBe("sess1");
  expect(s.failInFlight("daemon restarted")).toBe(1);
  expect(s.getRun(r.id)!.error).toBe("daemon restarted");
});

test("touchSession: first touch inside a git repo names the session after the repo dir", () => {
  const root = mkdtempSync(join(tmpdir(), "a0-git-"));
  const repoDir = join(root, "my-repo");
  const nestedCwd = join(repoDir, "src", "deep");
  mkdirSync(join(repoDir, ".git"), { recursive: true });
  mkdirSync(nestedCwd, { recursive: true });
  const s = new Store(":memory:");
  const sess = s.touchSession("sessA", nestedCwd);
  expect(sess.title).toBe("my-repo");
  expect(sess.cwd).toBe(nestedCwd);
});

test("touchSession: second touch with a different cwd keeps title and cwd, updates lastSeen", async () => {
  const s = new Store(":memory:");
  const first = s.touchSession("sessB", "/proj-a");
  await Bun.sleep(2);
  const second = s.touchSession("sessB", "/proj-b");
  expect(second.cwd).toBe("/proj-a");
  expect(second.title).toBe("proj-a");
  expect(second.lastSeen).toBeGreaterThan(first.lastSeen);
  expect(second.firstSeen).toBe(first.firstSeen);
});

test("touchSession: explicit title overrides the derived one, on first and later touches", () => {
  const s = new Store(":memory:");
  const first = s.touchSession("sessC", "/proj-c", "Custom Title");
  expect(first.title).toBe("Custom Title");
  const second = s.touchSession("sessC", "/proj-c", "Later Title");
  expect(second.title).toBe("Later Title");
  expect(second.cwd).toBe("/proj-c");
});

test("listSessions: aggregates runCount, runningCount, totalCost and cwds", () => {
  const s = new Store(":memory:");
  s.touchSession("sessD", "/proj-d1");
  const r1 = s.createRun({ id: newRunId(), sessionId: "sessD", title: "t1", cwd: "/proj-d1", provider: "p", model: "m", thinking: "high" });
  s.updateRun(r1.id, { status: "done", cost: 1.5 });
  const r2 = s.createRun({ id: newRunId(), sessionId: "sessD", title: "t2", cwd: "/proj-d2", provider: "p", model: "m", thinking: "high" });
  s.updateRun(r2.id, { status: "running", cost: 0.5 });
  const sessions = s.listSessions();
  const d = sessions.find(x => x.id === "sessD")!;
  expect(d.runCount).toBe(2);
  expect(d.runningCount).toBe(1);
  expect(d.totalCost).toBeCloseTo(2.0);
  expect(d.cwds).toEqual(["/proj-d1", "/proj-d2"]);
});

test("stats: running, queued, runsToday, costToday, totalRuns, totalCost", () => {
  const s = new Store(":memory:");
  s.touchSession("sessE", "/proj-e");
  const r1 = s.createRun({ id: newRunId(), sessionId: "sessE", title: "t1", cwd: "/proj-e", provider: "p", model: "m", thinking: "high" });
  s.updateRun(r1.id, { status: "done", cost: 2 });
  const r2 = s.createRun({ id: newRunId(), sessionId: "sessE", title: "t2", cwd: "/proj-e", provider: "p", model: "m", thinking: "high" });
  s.updateRun(r2.id, { status: "running", cost: 1 });
  const r3 = s.createRun({ id: newRunId(), sessionId: "sessE", title: "t3", cwd: "/proj-e", provider: "p", model: "m", thinking: "high" });
  s.updateRun(r3.id, { status: "queued" });
  const stats = s.stats(0);
  expect(stats.running).toBe(1);
  expect(stats.queued).toBe(1);
  expect(stats.totalRuns).toBe(3);
  expect(stats.totalCost).toBeCloseTo(3);
  expect(stats.runsToday).toBe(3);
  expect(stats.costToday).toBeCloseTo(3);
  const future = s.stats(Date.now() + 60_000);
  expect(future.runsToday).toBe(0);
  expect(future.costToday).toBe(0);
});
