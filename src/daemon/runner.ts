import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store, Run } from "./store"; import { newRunId } from "./store";
import type { Bus } from "./bus";
import { parseLine, summarize, type PiEvent } from "./events";

type Cfg = { home: string; piBin: string; concurrency: number; timeout: number };
type Submit = { sessionId: string; cwd: string; title: string; brief: string; provider?: string; model?: string; thinking?: string; timeout?: number };
type Active = { proc: ReturnType<typeof Bun.spawn>; timer: ReturnType<typeof setTimeout>; cancelled: boolean; timedOut: boolean };
const MAX_BRIEF = 100_000;

export class Runner {
  private active = new Map<string, Active>();
  private starting = new Set<string>();
  private queue: string[] = [];
  private waiters = new Map<string, Set<(r: Run) => void>>();
  constructor(private store: Store, private bus: Bus, private cfg: Cfg) { mkdirSync(join(cfg.home, "runs"), { recursive: true }); }
  runDir(id: string) { return join(this.cfg.home, "runs", id); }

  submit(i: Submit): Run {
    if (i.brief.length > MAX_BRIEF) throw new Error(`brief too long (${i.brief.length} > ${MAX_BRIEF})`);
    const id = newRunId(); const dir = this.runDir(id);
    mkdirSync(join(dir, "pi-session"), { recursive: true });
    writeFileSync(join(dir, "brief.md"), i.brief);
    this.store.touchSession(i.sessionId, i.cwd);
    const run = this.store.createRun({ id, sessionId: i.sessionId, title: i.title, cwd: i.cwd, provider: i.provider ?? "", model: i.model ?? "", thinking: i.thinking ?? "" });
    this.timeouts.set(id, i.timeout ?? this.cfg.timeout);
    this.queue.push(id); this.publishStatus(run); this.pump();
    return run;
  }
  private timeouts = new Map<string, number>();

  cancel(id: string): boolean {
    const qi = this.queue.indexOf(id);
    if (qi >= 0) { this.queue.splice(qi, 1); this.finish(id, { status: "cancelled", error: "cancelled before start" }); return true; }
    const a = this.active.get(id); if (!a) return false;
    a.cancelled = true; this.kill(a.proc); return true;
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

  private pump() {
    while (this.active.size + this.starting.size < this.cfg.concurrency && this.queue.length) this.start(this.queue.shift()!);
  }

  private start(id: string) {
    this.starting.add(id);
    const run = this.store.getRun(id)!; const dir = this.runDir(id);
    const brief = Bun.file(join(dir, "brief.md"));
    const args = [this.cfg.piBin, "-p", "--mode", "json", "--session-dir", join(dir, "pi-session"),
      ...(run.provider ? ["--provider", run.provider] : []), ...(run.model ? ["--model", run.model] : []),
      ...(run.thinking ? ["--thinking", run.thinking] : []), "--"];
    let proc: ReturnType<typeof Bun.spawn>;
    brief.text().then(text => {
      this.starting.delete(id);
      try { proc = Bun.spawn([...args, text], { cwd: run.cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env } }); }
      catch (e: any) { this.finish(id, { status: "failed", error: `spawn failed: ${e.message}` }); this.pump(); return; }
      const secs = this.timeouts.get(id) ?? this.cfg.timeout;
      const a: Active = { proc, cancelled: false, timedOut: false, timer: setTimeout(() => { a.timedOut = true; this.kill(proc); }, secs * 1000) };
      this.active.set(id, a);
      this.publishStatus(this.store.updateRun(id, { status: "running", started: Date.now() }));
      const events: PiEvent[] = []; let stderr = "";
      const pumpOut = this.readLines(proc.stdout as ReadableStream, line => {
        const e = parseLine(line); if (!e) return;
        events.push(e); appendFileSync(join(dir, "events.jsonl"), JSON.stringify(e) + "\n");
        this.bus.publish({ runId: id, kind: "event", data: e });
      });
      const pumpErr = new Response(proc.stderr as ReadableStream).text().then(t => { stderr = t; writeFileSync(join(dir, "stderr.log"), t); });
      Promise.all([proc.exited, pumpOut, pumpErr]).then(([code]) => {
        clearTimeout(a.timer); this.active.delete(id); this.timeouts.delete(id);
        const s = summarize(events);
        writeFileSync(join(dir, "result.md"), s.result);
        const base: Partial<Run> = { exitCode: code, piSessionId: s.piSessionId ?? null, result: s.result, inputTokens: s.inputTokens, outputTokens: s.outputTokens, cost: s.cost };
        if (a.cancelled) this.finish(id, { ...base, status: "cancelled", error: "cancelled" });
        else if (a.timedOut) this.finish(id, { ...base, status: "failed", error: "timeout" });
        else if (s.error) this.finish(id, { ...base, status: "failed", error: s.error });
        else if (code !== 0) this.finish(id, { ...base, status: "failed", error: `exit ${code}: ${stderr.split("\n").slice(-20).join("\n").trim()}` });
        else this.finish(id, { ...base, status: "done" });
        this.pump();
      });
    });
  }

  private async readLines(stream: ReadableStream, onLine: (l: string) => void) {
    const reader = stream.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const parts = buf.split("\n"); buf = parts.pop()!; parts.forEach(onLine); }
    if (buf) onLine(buf);
  }
  private kill(proc: ReturnType<typeof Bun.spawn>) { try { proc.kill("SIGTERM"); } catch {} setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 5000); }
  private finish(id: string, patch: Partial<Run>) {
    const run = this.store.updateRun(id, { ...patch, ended: Date.now() });
    this.publishStatus(run);
    this.waiters.get(id)?.forEach(fn => fn(run)); this.waiters.delete(id);
  }
  private publishStatus(run: Run) { this.bus.publish({ runId: run.id, kind: "status", data: run }); }
}
export const isTerminal = (s: string) => s === "done" || s === "failed" || s === "cancelled";
