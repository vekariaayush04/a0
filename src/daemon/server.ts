import { existsSync, readFileSync } from "node:fs"; import { join } from "node:path";
import type { Store, Run } from "./store"; import type { Runner } from "./runner"; import { isTerminal } from "./runner"; import type { Bus } from "./bus";
import { buildRunTree, readSubagentTranscript, type RunTree } from "./tree";

type Tiers = { l1: string; l2: string; l3: string };
type Defaults = { provider: string; model: string; thinking: string };
type Deps = { store: Store; runner: Runner; bus: Bus; port: number; uiPath: string; tiers: Tiers; defaults: Defaults };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const err = (msg: string, status = 400) => json({ error: msg }, status);

export function startServer(d: Deps) {
  const treeCache = new Map<string, RunTree>();
  const runTree = (run: Run): RunTree => {
    if (!isTerminal(run.status)) return buildRunTree(run, d.runner.runDir(run.id), d.tiers);
    const cached = treeCache.get(run.id);
    if (cached) return cached;
    const tree = buildRunTree(run, d.runner.runDir(run.id), d.tiers);
    treeCache.set(run.id, tree);
    return tree;
  };
  return Bun.serve({
    hostname: "127.0.0.1", port: d.port, idleTimeout: 255,
    async fetch(req, server) {
      const u = new URL(req.url); const p = u.pathname; const m = req.method;
      if (m !== "GET") {
        const origin = req.headers.get("origin");
        const port = server.port;
        if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return err("forbidden origin", 403);
      }
      if (m === "GET" && p === "/") return new Response(Bun.file(d.uiPath), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (m === "GET" && p === "/api/sessions") return json(d.store.listSessions());
      if (m === "GET" && p === "/api/stats") {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return json({ ...d.store.stats(midnight), tiers: d.tiers });
      }
      let mt: RegExpMatchArray | null;
      if (m === "GET" && (mt = p.match(/^\/api\/sessions\/([^/]+)\/runs$/))) return json(d.store.listRuns(decodeURIComponent(mt[1])));
      if (m === "GET" && p === "/api/runs") return json(d.store.listRuns());
      if (m === "POST" && p === "/api/runs") {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.startsWith("application/json")) return err("content-type must be application/json", 415);
        let b: any; try { b = await req.json(); } catch { return err("invalid json"); }
        for (const k of ["sessionId", "cwd", "title", "brief"]) if (typeof b?.[k] !== "string" || !b[k]) return err(`missing ${k}`);
        if (!existsSync(b.cwd)) return err("cwd does not exist");
        if (b.tier !== undefined && !Object.prototype.hasOwnProperty.call(d.tiers, b.tier)) return err("unknown tier");
        if (b.timeout !== undefined && !(typeof b.timeout === "number" && Number.isFinite(b.timeout) && b.timeout > 0)) return err("timeout must be a positive number");
        let sessionTitle: string | undefined;
        if (b.sessionTitle !== undefined) {
          if (typeof b.sessionTitle !== "string") return err("sessionTitle must be a string");
          const trimmed = b.sessionTitle.trim();
          if (trimmed.length > 200) return err("sessionTitle must be at most 200 characters");
          sessionTitle = trimmed || undefined;
        }
        const model = b.model ?? (b.tier ? (d.tiers as any)[b.tier] : undefined) ?? d.defaults.model;
        const provider = b.provider ?? d.defaults.provider;
        const thinking = b.thinking ?? d.defaults.thinking;
        try { return json(d.runner.submit({ ...b, provider, model, thinking, sessionTitle }), 201); } catch (e: any) { return err(e.message); }
      }
      if (m === "GET" && p === "/api/events") return sse(d.bus, "*", null);
      if (m === "GET" && (mt = p.match(/^\/api\/runs\/([^/]+)\/tree$/))) {
        const run = d.store.getRun(decodeURIComponent(mt[1])); if (!run) return err("no such run", 404);
        return json(runTree(run));
      }
      if (m === "GET" && (mt = p.match(/^\/api\/sessions\/([^/]+)\/tree$/))) {
        const id = decodeURIComponent(mt[1]);
        const sessions = d.store.listSessions(); const session = sessions.find(s => s.id === id);
        if (!session) return err("no such session", 404);
        const runs = d.store.listRuns(id).slice().sort((a, b) => a.created - b.created);
        return json({ kind: "session", id: session.id, title: session.title, runCount: session.runCount, totalCost: session.totalCost, children: runs.map(runTree) });
      }
      if (m === "GET" && (mt = p.match(/^\/api\/runs\/([^/]+)\/subagents\/(\d+)\/transcript$/))) {
        const run = d.store.getRun(decodeURIComponent(mt[1])); if (!run) return err("no such run", 404);
        const transcript = readSubagentTranscript(d.runner.runDir(run.id), Number(mt[2]));
        if (!transcript) return err("no such subagent", 404);
        return json(transcript);
      }
      if ((mt = p.match(/^\/api\/runs\/([^/]+)(?:\/(wait|result|events|cancel))?$/))) {
        const id = mt[1], sub = mt[2]; const run = d.store.getRun(id); if (!run) return err("no such run", 404);
        if (m === "GET" && !sub) return json(run);
        if (m === "GET" && sub === "wait") {
          let t = Number(u.searchParams.get("timeout"));
          if (!Number.isFinite(t) || t <= 0) t = 60;
          t = Math.min(3600, t);
          return json(await d.runner.waitFor(id, t * 1000));
        }
        if (m === "GET" && sub === "result") return new Response(run.result ?? "", { headers: { "content-type": "text/plain; charset=utf-8" } });
        if (m === "GET" && sub === "events") {
          const replay = u.searchParams.get("replay") === "1";
          return sse(d.bus, id, join(d.runner.runDir(id), "events.jsonl"), replay || isTerminal(run.status));
        }
        if (m === "POST" && sub === "cancel") return d.runner.cancel(id) ? json(d.store.getRun(id)) : err("run not active", 409);
      }
      return err("not found", 404);
    },
  });
}

function sse(bus: Bus, key: string, replayPath: string | null, alreadyDone = false) {
  const enc = new TextEncoder();
  let off: (() => void) | null = null;
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (ev: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
      ctrl.enqueue(enc.encode(": connected\n\n")); // flush headers/first byte immediately so clients see the stream open
      if (replayPath && existsSync(replayPath)) for (const l of readFileSync(replayPath, "utf8").split("\n")) {
        if (!l.trim()) continue;
        try { send("event", JSON.parse(l)); } catch { /* skip malformed line */ }
      }
      if (alreadyDone) { send("done", {}); ctrl.close(); return; }
      off = bus.subscribe(key, msg => {
        if (key === "*" && msg.kind !== "status") return; // global feed: status changes only (run list refresh), not per-token events
        send(msg.kind, msg.data);
        if (key !== "*" && msg.kind === "status" && isTerminal(msg.data.status)) { send("done", {}); off?.(); ctrl.close(); }
      });
    },
    cancel() { off?.(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
}
