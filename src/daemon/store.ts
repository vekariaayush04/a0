import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
export type Status = "queued"|"running"|"done"|"failed"|"cancelled";
export type Session = { id:string; cwd:string; title:string; firstSeen:number; lastSeen:number; runCount:number; runningCount:number; totalCost:number; cwds:string[] };

/** Walks up from cwd (inclusive) looking for a `.git` entry; returns that ancestor's dirname, or null. */
function gitRootTitle(cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return basename(dir);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
export type Run = { id:string; sessionId:string; title:string; cwd:string; provider:string; model:string; thinking:string; status:Status; created:number; started:number|null; ended:number|null; exitCode:number|null; piSessionId:string|null; result:string|null; inputTokens:number; outputTokens:number; cost:number; error:string|null };

export function newRunId(): string {
  const t = Date.now().toString(36).padStart(9, "0");
  const r = Math.random().toString(36).slice(2, 6);
  return `${t}${r}`;
}

const COLS = "id,session_id sessionId,title,cwd,provider,model,thinking,status,created,started,ended,exit_code exitCode,pi_session_id piSessionId,result,input_tokens inputTokens,output_tokens outputTokens,cost,error";
const SNAKE: Record<string,string> = { sessionId:"session_id", exitCode:"exit_code", piSessionId:"pi_session_id", inputTokens:"input_tokens", outputTokens:"output_tokens" };

export class Store {
  db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, cwd TEXT, title TEXT, first_seen INTEGER, last_seen INTEGER);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, session_id TEXT, title TEXT, cwd TEXT, provider TEXT, model TEXT, thinking TEXT, status TEXT, created INTEGER, started INTEGER, ended INTEGER, exit_code INTEGER, pi_session_id TEXT, result TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cost REAL DEFAULT 0, error TEXT);
      CREATE INDEX IF NOT EXISTS runs_session ON runs(session_id, created DESC);`);
  }
  touchSession(id: string, cwd: string, title?: string): Session {
    const now = Date.now();
    const existing = this.db.query(`SELECT id FROM sessions WHERE id=?`).get(id);
    if (existing) {
      if (title) this.db.run(`UPDATE sessions SET last_seen=?, title=? WHERE id=?`, [now, title, id]);
      else this.db.run(`UPDATE sessions SET last_seen=? WHERE id=?`, [now, id]);
    } else {
      const resolvedTitle = title ?? gitRootTitle(cwd) ?? basename(cwd);
      this.db.run(`INSERT INTO sessions(id,cwd,title,first_seen,last_seen) VALUES(?,?,?,?,?)`, [id, cwd, resolvedTitle, now, now]);
    }
    return this.sessionWithAggregates(id)!;
  }
  private sessionWithAggregates(id: string): Session | null {
    const s = this.db.query(`SELECT id,cwd,title,first_seen firstSeen,last_seen lastSeen FROM sessions WHERE id=?`).get(id) as any;
    if (!s) return null;
    const agg = this.db.query(`SELECT COUNT(*) runCount, COALESCE(SUM(CASE WHEN status IN ('running','queued') THEN 1 ELSE 0 END),0) runningCount, COALESCE(SUM(cost),0) totalCost FROM runs WHERE session_id=?`).get(id) as any;
    const cwds = (this.db.query(`SELECT cwd FROM runs WHERE session_id=? GROUP BY cwd ORDER BY MIN(created) ASC`).all(id) as any[]).map(r => r.cwd);
    return { ...s, runCount: agg.runCount, runningCount: agg.runningCount, totalCost: agg.totalCost, cwds };
  }
  listSessions(): Session[] {
    const ids = (this.db.query(`SELECT id FROM sessions ORDER BY last_seen DESC`).all() as any[]).map(r => r.id);
    return ids.map(id => this.sessionWithAggregates(id)!);
  }
  createRun(r: Pick<Run,"id"|"sessionId"|"title"|"cwd"|"provider"|"model"|"thinking">): Run {
    this.db.run(`INSERT INTO runs(id,session_id,title,cwd,provider,model,thinking,status,created) VALUES(?,?,?,?,?,?,?,'queued',?)`, [r.id, r.sessionId, r.title, r.cwd, r.provider, r.model, r.thinking, Date.now()]);
    return this.getRun(r.id)!;
  }
  getRun(id: string): Run | null { return (this.db.query(`SELECT ${COLS} FROM runs WHERE id=?`).get(id) as Run) ?? null; }
  listRuns(sessionId?: string): Run[] {
    return sessionId ? this.db.query(`SELECT ${COLS} FROM runs WHERE session_id=? ORDER BY created DESC`).all(sessionId) as Run[]
                     : this.db.query(`SELECT ${COLS} FROM runs ORDER BY created DESC`).all() as Run[];
  }
  updateRun(id: string, patch: Partial<Run>): Run {
    const keys = Object.keys(patch) as (keyof Run)[];
    if (keys.length) this.db.run(`UPDATE runs SET ${keys.map(k => `${SNAKE[k] ?? k}=?`).join(",")} WHERE id=?`, [...keys.map(k => patch[k] as any), id]);
    return this.getRun(id)!;
  }
  failInFlight(reason: string): number {
    return this.db.run(`UPDATE runs SET status='failed', error=?, ended=? WHERE status IN ('queued','running')`, [reason, Date.now()]).changes;
  }
  stats(sinceMs: number): { running:number; queued:number; runsToday:number; costToday:number; totalRuns:number; totalCost:number } {
    const overall = this.db.query(`SELECT
        COALESCE(SUM(CASE WHEN status='running' THEN 1 ELSE 0 END),0) running,
        COALESCE(SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END),0) queued,
        COUNT(*) totalRuns,
        COALESCE(SUM(cost),0) totalCost
      FROM runs`).get() as any;
    const today = this.db.query(`SELECT COUNT(*) runsToday, COALESCE(SUM(cost),0) costToday FROM runs WHERE created >= ?`).get(sinceMs) as any;
    return { running: overall.running, queued: overall.queued, runsToday: today.runsToday, costToday: today.costToday, totalRuns: overall.totalRuns, totalCost: overall.totalCost };
  }
}
