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
