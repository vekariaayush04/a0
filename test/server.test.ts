import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { Store } from "../src/daemon/store"; import { Bus } from "../src/daemon/bus"; import { Runner } from "../src/daemon/runner"; import { startServer } from "../src/daemon/server";
let url: string, server: any, home: string;
const tiers = { l1: "muse-spark-1.3-contributor", l2: "deepseek-v4.1-flash", l3: "glm-5.3" };
const defaults = { provider: "opencode-go", model: "deepseek-v4.1-flash", thinking: "high" };
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "sentinel-")); const store = new Store(":memory:"); const bus = new Bus();
  const runner = new Runner(store, bus, { home, piBin: join(import.meta.dir, "fake-pi/pi"), concurrency: 2, timeout: 60 });
  server = startServer({ store, runner, bus, port: 0, uiPath: join(import.meta.dir, "../src/ui/index.html"), tiers, defaults });
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));
const post = (p: string, b: any) => fetch(url + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("create, wait, result, lists", async () => {
  const r = await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "hi" });
  expect(r.status).toBe(201); const run = await r.json();
  const w = await (await fetch(`${url}/api/runs/${run.id}/wait?timeout=5`)).json();
  expect(w.status).toBe("done");
  expect(await (await fetch(`${url}/api/runs/${run.id}/result`)).text()).toBe("echo: hi");
  expect((await (await fetch(`${url}/api/sessions`)).json())[0].id).toBe("s1");
  expect((await (await fetch(`${url}/api/sessions/s1/runs`)).json()).length).toBe(1);
});

test("validation", async () => {
  expect((await post("/api/runs", { title: "x" })).status).toBe(400);
  expect((await fetch(`${url}/api/runs/nope`)).status).toBe(404);
});

test("sse replays and finishes", async () => {
  const run = await (await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "sse" })).json();
  const res = await fetch(`${url}/api/runs/${run.id}/events`);
  const text = await res.text(); // stream closes on done
  expect(text).toContain("event: event"); expect(text).toContain('"type":"session"'); expect(text.trim().endsWith("event: done\ndata: {}")).toBe(true);
});

test("serves ui", async () => { expect(await (await fetch(url + "/")).text()).toContain("Sentinel"); });

test("global events feed forwards status frames only, not per-token events", async () => {
  const ac = new AbortController();
  const res = await fetch(`${url}/api/events`, { signal: ac.signal });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "";
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
      }
    } catch { /* aborted */ }
  })();
  await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "global-feed" });
  await Bun.sleep(1000);
  ac.abort();
  await Promise.race([pump, Bun.sleep(2000)]);
  expect(text).toContain("event: status");
  expect(text).not.toContain("event: event");
});

test("csrf: cross-origin text/plain POST is rejected", async () => {
  const r = await fetch(`${url}/api/runs`, { method: "POST", headers: { "content-type": "text/plain", origin: "http://evil.example" }, body: "{}" });
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("forbidden origin");
});

test("csrf: cross-origin JSON POST is rejected", async () => {
  const r = await fetch(`${url}/api/runs`, { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: JSON.stringify({ sessionId: "s1", cwd: home, title: "T", brief: "hi" }) });
  expect(r.status).toBe(403);
  expect((await r.json()).error).toBe("forbidden origin");
});

test("csrf: same-origin JSON POST is accepted", async () => {
  const r = await fetch(`${url}/api/runs`, { method: "POST", headers: { "content-type": "application/json", origin: url }, body: JSON.stringify({ sessionId: "s1", cwd: home, title: "T", brief: "hi" }) });
  expect(r.status).toBe(201);
});

test("csrf: no-Origin JSON POST (CLI) is accepted", async () => {
  const r = await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "hi" });
  expect(r.status).toBe(201);
});

test("csrf: text/plain POST without Origin is rejected for content-type, not origin", async () => {
  const r = await fetch(`${url}/api/runs`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  expect(r.status).toBe(415);
  expect((await r.json()).error).toBe("content-type must be application/json");
});

test("timeout validation: non-positive timeout is rejected", async () => {
  const r = await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "hi", timeout: 0 });
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe("timeout must be a positive number");
});

test("wait?timeout=abc falls back and returns terminal status for a finished run", async () => {
  const run = await (await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "quick" })).json();
  await (await fetch(`${url}/api/runs/${run.id}/wait?timeout=5`)).json();
  const w = await (await fetch(`${url}/api/runs/${run.id}/wait?timeout=abc`)).json();
  expect(["done", "failed", "cancelled"]).toContain(w.status);
});

test("events?replay=1 returns quickly and ends with done even while running", async () => {
  process.env.FAKE_PI_SLEEP = "3";
  try {
    const run = await (await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "replay" })).json();
    await Bun.sleep(200);
    const start = Date.now();
    const res = await fetch(`${url}/api/runs/${run.id}/events?replay=1`);
    const text = await res.text();
    expect(Date.now() - start).toBeLessThan(1000);
    expect(text.trim().endsWith("event: done\ndata: {}")).toBe(true);
  } finally { delete process.env.FAKE_PI_SLEEP; }
});

test("tier resolution", async () => {
  const r1 = await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "tier1", tier: "l1" });
  expect(r1.status).toBe(201);
  const run1 = await r1.json();
  expect(run1.model).toBe("muse-spark-1.3-contributor");

  const r2 = await post("/api/runs", { sessionId: "s1", cwd: home, title: "T", brief: "tier9", tier: "l9" });
  expect(r2.status).toBe(400);
});
