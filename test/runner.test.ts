import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { Store } from "../src/daemon/store"; import { Bus } from "../src/daemon/bus"; import { Runner } from "../src/daemon/runner";
const PI = join(import.meta.dir, "fake-pi/pi");
let home: string, store: Store, bus: Bus;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "sentinel-")); store = new Store(":memory:"); bus = new Bus(); });
const mk = (o: Partial<ConstructorParameters<typeof Runner>[2]> = {}) => new Runner(store, bus, { home, piBin: PI, concurrency: 1, timeout: 60, ...o });
const base = () => ({ sessionId: "s", cwd: home, title: "t", brief: "hello" });

test("runs to done with result and usage", async () => {
  const r = mk(); const run = r.submit(base());
  const done = await r.waitFor(run.id, 5000);
  expect(done.status).toBe("done"); expect(done.result).toBe("echo: hello");
  expect(done.outputTokens).toBe(5); expect(done.exitCode).toBe(0);
  expect(done.piSessionId).toBe("00000000-0000-4000-8000-000000000001");
  expect(await Bun.file(join(r.runDir(run.id), "result.md")).text()).toBe("echo: hello");
  expect((await Bun.file(join(r.runDir(run.id), "events.jsonl")).text()).split("\n").filter(Boolean).length).toBe(4);
  expect(await Bun.file(join(r.runDir(run.id), "stderr.log")).text()).toContain("fake stderr");
});

test("non-zero exit fails with stderr tail", async () => {
  process.env.FAKE_PI_EXIT = "3";
  try {
    const r = mk(); const run = r.submit(base());
    const done = await r.waitFor(run.id, 5000);
    expect(done.status).toBe("failed"); expect(done.exitCode).toBe(3); expect(done.error).toContain("fake stderr");
  } finally { delete process.env.FAKE_PI_EXIT; }
});

test("error stop reason fails", async () => {
  process.env.FAKE_PI_FAIL = "1";
  try {
    const r = mk(); const run = r.submit(base());
    const done = await r.waitFor(run.id, 5000);
    expect(done.status).toBe("failed"); expect(done.error).toBe("fake failure");
  } finally { delete process.env.FAKE_PI_FAIL; }
});

test("timeout kills and fails", async () => {
  process.env.FAKE_PI_SLEEP = "5";
  try {
    const r = mk({ timeout: 1 }); const run = r.submit(base());
    const done = await r.waitFor(run.id, 8000);
    expect(done.status).toBe("failed"); expect(done.error).toBe("timeout");
  } finally { delete process.env.FAKE_PI_SLEEP; }
}, 10000);

test("cancel", async () => {
  process.env.FAKE_PI_SLEEP = "5";
  try {
    const r = mk(); const run = r.submit(base());
    await Bun.sleep(200); expect(r.cancel(run.id)).toBe(true);
    const done = await r.waitFor(run.id, 5000);
    expect(done.status).toBe("cancelled");
  } finally { delete process.env.FAKE_PI_SLEEP; }
}, 10000);

test("concurrency cap queues", async () => {
  process.env.FAKE_PI_SLEEP = "1";
  try {
    const r = mk({ concurrency: 1 });
    const a = r.submit(base()), b = r.submit(base());
    await Bun.sleep(200);
    expect(store.getRun(a.id)!.status).toBe("running"); expect(store.getRun(b.id)!.status).toBe("queued");
    await r.waitFor(b.id, 8000);
    expect(store.getRun(b.id)!.status).toBe("done");
  } finally { delete process.env.FAKE_PI_SLEEP; }
}, 10000);

test("bus receives events and status", async () => {
  const r = mk(); const kinds: string[] = []; bus.subscribe("*", m => kinds.push(m.kind));
  const run = r.submit(base()); await r.waitFor(run.id, 5000);
  expect(kinds.filter(k => k === "event").length).toBe(4); expect(kinds[kinds.length - 1]).toBe("status");
});

test("cancel called synchronously after submit (before brief read resolves) still cancels", async () => {
  const r = mk(); const run = r.submit(base());
  // No await yet: start()'s async brief.text() chain cannot have resolved, so the
  // run is still in the "starting" window. cancel() must still succeed.
  expect(r.cancel(run.id)).toBe(true);
  const done = await r.waitFor(run.id, 5000);
  expect(done.status).toBe("cancelled");
});

test("brief unreadable fails the run without hanging", async () => {
  // Bun.file(...).text() reads its content synchronously enough that swapping
  // brief.md for a directory right after submit() never wins the race (verified:
  // the read already has the old bytes in hand by the time we'd replace it).
  // Runner.readBrief() exists precisely so this can be tested deterministically
  // instead: override it to reject like a real unreadable-file error would.
  class FlakyRunner extends Runner {
    protected override readBrief(): Promise<string> { return Promise.reject(new Error("EISDIR: illegal operation on a directory")); }
  }
  const r = new FlakyRunner(store, bus, { home, piBin: PI, concurrency: 1, timeout: 60 });
  const run = r.submit(base());
  const done = await r.waitFor(run.id, 5000);
  expect(done.status).toBe("failed");
  expect(done.error).toBe("brief unreadable: EISDIR: illegal operation on a directory");
});

test("cancelling a queued run clears its pending timeout", async () => {
  process.env.FAKE_PI_SLEEP = "1";
  try {
    const r = mk({ concurrency: 1 });
    const a = r.submit(base()); const b = r.submit(base());
    expect(r.cancel(b.id)).toBe(true);
    const done = await r.waitFor(b.id, 5000);
    expect(done.status).toBe("cancelled");
    await r.waitFor(a.id, 5000);
  } finally { delete process.env.FAKE_PI_SLEEP; }
}, 10000);

test("double cancel on a running run does not throw and ends cancelled", async () => {
  process.env.FAKE_PI_SLEEP = "5";
  try {
    const r = mk(); const run = r.submit(base());
    await Bun.sleep(200);
    expect(r.cancel(run.id)).toBe(true);
    expect(() => r.cancel(run.id)).not.toThrow();
    const done = await r.waitFor(run.id, 5000);
    expect(done.status).toBe("cancelled");
  } finally { delete process.env.FAKE_PI_SLEEP; }
}, 10000);
