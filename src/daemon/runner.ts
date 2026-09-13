import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store, Run } from "./store"; import { newRunId } from "./store";
import type { Bus } from "./bus";
import { parseLine, summarize, type PiEvent } from "./events";

type Cfg = { home: string; piBin: string; concurrency: number; timeout: number };
type Submit = { sessionId: string; cwd: string; title: string; brief: string; provider?: string; model?: string; thinking?: string; timeout?: number; sessionTitle?: string };
type Active = { proc: ReturnType<typeof Bun.spawn>; timer: ReturnType<typeof setTimeout>; killTimer: ReturnType<typeof setTimeout> | null; cancelled: boolean; timedOut: boolean };
const MAX_BRIEF = 100_000;
export const KILL_GRACE_MS = 5000;

export class Runner {
  private active = new Map<string, Active>();
  private starting = new Set<string>();
  private cancelRequested = new Set<string>();
  private queue: string[] = [];
  private waiters = new Map<string, Set<(r: Run) => void>>();
  constructor(private store: Store, private bus: Bus, private cfg: Cfg) { mkdirSync(join(cfg.home, "runs"), { recursive: true }); }
  runDir(id: string) { return join(this.cfg.home, "runs", id); }

  submit(i: Submit): Run {
    if (i.brief.length > MAX_BRIEF) throw new Error(`brief too long (${i.brief.length} > ${MAX_BRIEF})`);
    const id = newRunId(); const dir = this.runDir(id);
    mkdirSync(join(dir, "pi-session"), { recursive: true });
    writeFileSync(join(dir, "brief.md"), i.brief);
    this.store.touchSession(i.sessionId, i.cwd, i.sessionTitle);
    const run = this.store.createRun({ id, sessionId: i.sessionId, title: i.title, cwd: i.cwd, provider: i.provider ?? "", model: i.model ?? "", thinking: i.thinking ?? "" });
    const timeout = typeof i.timeout === "number" && Number.isFinite(i.timeout) && i.timeout > 0 ? i.timeout : this.cfg.timeout;
    this.timeouts.set(id, timeout);
    this.queue.push(id); this.publishStatus(run); this.pump();
    return run;
  }
  private timeouts = new Map<string, number>();

  cancel(id: string): boolean {
    const qi = this.queue.indexOf(id);
    if (qi >= 0) { this.queue.splice(qi, 1); this.timeouts.delete(id); this.finish(id, { status: "cancelled", error: "cancelled before start" }); return true; }
    if (this.starting.has(id)) { this.cancelRequested.add(id); return true; }
    const a = this.active.get(id); if (!a) return false;
    a.cancelled = true; this.kill(a); return true;
  }

  waitFor(id: string, timeoutMs: number): Promise<Run> {
    const cur = this.store.getRun(id);
    if (!cur) return Promise.reject(new Error("no such run"));
    if (isTerminal(cur.status)) return Promise.resolve(cur);
    return new Promise(resolve => {
      const set = this.waiters.get(id) ?? new Set(); this.waiters.set(id, set);
      const t = setTimeout(() => { set.delete(fn); resolve(this.store.getRun(id)!); }, timeoutMs);
      const fn = (r: Run) => { clearTimeout(t); resolve(r); }; set.add(fn);
    });
  }

  /** SIGTERMs every active child (same kill path as a single cancel). Used on daemon shutdown. */
  shutdown() {
    for (const a of this.active.values()) { a.cancelled = true; this.kill(a); }
  }

  private pump() {
    while (this.active.size + this.starting.size < this.cfg.concurrency && this.queue.length) this.start(this.queue.shift()!);
  }

  /** Reads a run's brief off disk. Overridable in tests to deterministically simulate an unreadable brief. */
  protected readBrief(path: string): Promise<string> {
    return Bun.file(path).text();
  }

  private start(id: string) {
    this.starting.add(id);
    const run = this.store.getRun(id)!; const dir = this.runDir(id);
    const args = [this.cfg.piBin, "-p", "--mode", "json", "--session-dir", join(dir, "pi-session"),
      ...(run.provider ? ["--provider", run.provider] : []), ...(run.model ? ["--model", run.model] : []),
      ...(run.thinking ? ["--thinking", run.thinking] : []), "--"];
    let proc: ReturnType<typeof Bun.spawn>;
    this.readBrief(join(dir, "brief.md")).then(text => {
      this.starting.delete(id);
      if (this.cancelRequested.delete(id)) { this.finish(id, { status: "cancelled", error: "cancelled before start" }); this.pump(); return; }
      try { proc = Bun.spawn([...args, text], { cwd: run.cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env } }); }
      catch (e: any) { this.finish(id, { status: "failed", error: `spawn failed: ${e.message}` }); this.pump(); return; }
      const secs = this.timeouts.get(id) ?? this.cfg.timeout;
      const a: Active = { proc, cancelled: false, timedOut: false, killTimer: null, timer: setTimeout(() => { a.timedOut = true; this.kill(a); }, secs * 1000) };
      this.active.set(id, a);
      this.publishStatus(this.store.updateRun(id, { status: "running", started: Date.now() }));
      const events: PiEvent[] = []; let stderr = "";
      const pumpOut = this.readLines(proc.stdout as ReadableStream, line => {
        const e = parseLine(line); if (!e) return;
        e.ts = Date.now();
        events.push(e); appendFileSync(join(dir, "events.jsonl"), JSON.stringify(e) + "\n");
        this.bus.publish({ runId: id, kind: "event", data: e });
      });
      const pumpErr = new Response(proc.stderr as ReadableStream).text().then(t => { stderr = t; writeFileSync(join(dir, "stderr.log"), t); });
      const settle = () => { clearTimeout(a.timer); if (a.killTimer) { clearTimeout(a.killTimer); a.killTimer = null; } this.active.delete(id); this.timeouts.delete(id); };
      Promise.all([proc.exited, pumpOut, pumpErr]).then(([code]) => {
        settle();
        const s = summarize(events);
        writeFileSync(join(dir, "result.md"), s.result);
        const base: Partial<Run> = { exitCode: code, piSessionId: s.piSessionId ?? null, result: s.result, inputTokens: s.inputTokens, outputTokens: s.outputTokens, cost: s.cost };
        if (a.cancelled) this.finish(id, { ...base, status: "cancelled", error: "cancelled" });
        else if (a.timedOut) this.finish(id, { ...base, status: "failed", error: "timeout" });
        else if (s.error) this.finish(id, { ...base, status: "failed", error: s.error });
        else if (code !== 0) this.finish(id, { ...base, status: "failed", error: `exit ${code}: ${stderr.split("\n").slice(-20).join("\n").trim()}` });
        else this.finish(id, { ...base, status: "done" });
        this.pump();
      }).catch((e: any) => {
        settle();
        try { proc.kill("SIGKILL"); } catch {}
        this.finish(id, { status: "failed", error: `internal: ${e?.message ?? String(e)}` });
        this.pump();
      });
    }).catch((e: any) => {
      this.starting.delete(id);
      this.cancelRequested.delete(id);
      this.finish(id, { status: "failed", error: `brief unreadable: ${e?.message ?? String(e)}` });
      this.pump();
    });
  }

  private async readLines(stream: ReadableStream, onLine: (l: string) => void) {
    const reader = stream.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const parts = buf.split("\n"); buf = parts.pop()!; parts.forEach(onLine); }
    if (buf) onLine(buf);
  }
  private kill(a: Active) {
    if (a.killTimer) return;
    try { a.proc.kill("SIGTERM"); } catch {}
    a.killTimer = setTimeout(() => { try { a.proc.kill("SIGKILL"); } catch {} }, KILL_GRACE_MS);
  }
  private finish(id: string, patch: Partial<Run>) {
    const run = this.store.updateRun(id, { ...patch, ended: Date.now() });
    this.publishStatus(run);
    this.waiters.get(id)?.forEach(fn => fn(run)); this.waiters.delete(id);
  }
  private publishStatus(run: Run) { this.bus.publish({ runId: run.id, kind: "status", data: run }); }
}
export const isTerminal = (s: string) => s === "done" || s === "failed" || s === "cancelled";
