import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { Store } from "../src/daemon/store"; import { Bus } from "../src/daemon/bus"; import { Runner } from "../src/daemon/runner"; import { startServer } from "../src/daemon/server";
let server: any, home: string, env: Record<string,string>;
const tiers = { l1: "muse-spark-1.3-contributor", l2: "deepseek-v4.1-flash", l3: "glm-5.3" };
const defaults = { provider: "opencode-go", model: "deepseek-v4.1-flash", thinking: "high" };
const cli = async (...args: string[]) => { const p = Bun.spawn(["bun", join(import.meta.dir, "../src/cli/main.ts"), ...args], { env, stdout: "pipe", stderr: "pipe" }); const out = await new Response(p.stdout).text(); return { code: await p.exited, out, err: await new Response(p.stderr).text() }; };
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "sentinel-")); const store = new Store(":memory:"); const bus = new Bus();
  server = startServer({ store, runner: new Runner(store, bus, { home, piBin: join(import.meta.dir, "fake-pi/pi"), concurrency: 2, timeout: 60 }), bus, port: 0, uiPath: join(import.meta.dir, "../src/ui/index.html"), tiers, defaults });
  env = { ...process.env as any, SENTINEL_URL: `http://127.0.0.1:${server.port}`, CLAUDE_SESSION_ID: "cli-sess" };
});
afterAll(() => server.stop(true));

test("run --wait then result and status", async () => {
  const f = join(home, "brief.md"); writeFileSync(f, "do the thing");
  const r = await cli("run", "--title", "T", "--brief-file", f, "--cwd", home, "--wait");
  expect(r.code).toBe(0); const run = JSON.parse(r.out); expect(run.status).toBe("done"); expect(run.sessionId).toBe("cli-sess");
  expect((await cli("result", run.id)).out).toBe("echo: do the thing");
  const st = JSON.parse((await cli("status", "--json")).out); expect(st.runs.length).toBe(1);
  const logs = await cli("logs", run.id); expect(logs.out).toContain("echo: do the thing");
});

test("run without brief errors", async () => { const r = await cli("run", "--title", "T"); expect(r.code).toBe(1); expect(r.err).toContain("brief"); });

test("run --tier passes through to model", async () => {
  const r = await cli("run", "--title", "T", "--brief", "x", "--tier", "l1", "--cwd", home, "--wait");
  expect(r.code).toBe(0);
  const run = JSON.parse(r.out);
  expect(run.model).toBe("muse-spark-1.3-contributor");
});

test("run --brief-file with nonexistent path errors with path in message", async () => {
  const r = await cli("run", "--title", "T", "--brief-file", "/nonexistent/path");
  expect(r.code).toBe(1);
  const parsed = JSON.parse(r.err);
  expect(parsed.error).toContain("/nonexistent/path");
});

test("unknown flag errors with option in message", async () => {
  const r = await cli("status", "--bogus-flag");
  expect(r.code).toBe(1);
  const parsed = JSON.parse(r.err);
  expect(parsed.error.toLowerCase()).toContain("bogus-flag");
});

test("run --timeout 0 is rejected client-side", async () => {
  const r = await cli("run", "--title", "T", "--brief", "x", "--cwd", home, "--timeout", "0");
  expect(r.code).toBe(1);
  const parsed = JSON.parse(r.err);
  expect(parsed.error).toContain("--timeout");
});

test("result --json <id> works with flag before the positional", async () => {
  const run = JSON.parse((await cli("run", "--title", "T", "--brief", "y", "--cwd", home, "--wait")).out);
  const r = await cli("result", "--json", run.id);
  expect(r.code).toBe(0);
  expect(r.out).toBe("echo: y");
});

test("run --session-title X sets the session title, visible in status --json", async () => {
  const r = await cli("run", "--title", "T", "--brief", "x", "--cwd", home, "--session", "cli-titled-sess", "--session-title", "X", "--wait");
  expect(r.code).toBe(0);
  const st = JSON.parse((await cli("status", "--session", "cli-titled-sess", "--json")).out);
  expect(st.sessions.find((s: any) => s.id === "cli-titled-sess").title).toBe("X");
});

test("wait with multiple ids returns done runs in given order", async () => {
  const f = join(home, "brief2.md"); writeFileSync(f, "second thing");
  const a = JSON.parse((await cli("run", "--title", "A", "--brief", "alpha", "--cwd", home)).out);
  const b = JSON.parse((await cli("run", "--title", "B", "--brief-file", f, "--cwd", home)).out);
  const r = await cli("wait", a.id, b.id);
  expect(r.code).toBe(0);
  const runs = JSON.parse(r.out);
  expect(runs.length).toBe(2);
  expect(runs[0].id).toBe(a.id);
  expect(runs[1].id).toBe(b.id);
  expect(runs[0].status).toBe("done");
  expect(runs[1].status).toBe("done");
});
