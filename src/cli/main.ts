#!/usr/bin/env bun
import { parseArgs } from "node:util";

const BASE = process.env.SENTINEL_URL ?? `http://127.0.0.1:${process.env.SENTINEL_PORT ?? 4747}`;
const [cmd, ...rest] = process.argv.slice(2);

function die(m: string): never {
  console.error(JSON.stringify({ error: m }));
  process.exit(1);
}

async function api(p: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(BASE + p, init);
  } catch {
    return die(`cannot reach sentineld at ${BASE}; run \`sentinel daemon\` or \`sentinel install\``);
  }
  if (!res.ok) {
    let m = res.statusText;
    try {
      m = (await res.json()).error ?? m;
    } catch {}
    return die(m);
  }
  return res;
}

function pretty(v: any): string {
  if (Array.isArray(v)) return v.map(pretty).join("\n");
  if (v && typeof v === "object" && "status" in v) {
    return `${v.id}  ${v.status.padEnd(9)} ${v.model || ""}  ${v.title}`;
  }
  return JSON.stringify(v, null, 2);
}

function jsonOut(v: unknown, force: boolean) {
  console.log(force || !process.stdout.isTTY ? JSON.stringify(v, null, 2) : pretty(v));
}

async function waitAll(ids: string[]) {
  const out = [];
  for (const id of ids) {
    for (;;) {
      const r = await (await api(`/api/runs/${id}/wait?timeout=60`)).json();
      if (["done", "failed", "cancelled"].includes(r.status)) {
        out.push(r);
        break;
      }
    }
  }
  return out;
}

function renderEvent(e: any): string | null {
  if (e.type === "message_end" && e.message?.role === "assistant") {
    const text = (e.message.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
    return e.message.stopReason === "error" ? `! ${e.message.errorMessage}` : text || null;
  }
  if (e.type === "tool_execution_start" || e.type === "tool_start") {
    return `▸ tool ${e.toolName ?? e.name ?? ""}`;
  }
  if (e.type === "message_end" && e.message?.role === "user") {
    return `> ${(e.message.content ?? []).map((c: any) => c.text ?? "").join("")}`;
  }
  return null;
}

function opts(spec: Record<string, any>) {
  return parseArgs({ args: rest, options: { json: { type: "boolean" }, ...spec }, allowPositionals: true });
}

async function runCommand() {
  const { values: v } = opts({
    title: { type: "string" },
    "brief-file": { type: "string" },
    brief: { type: "string" },
    session: { type: "string" },
    cwd: { type: "string" },
    model: { type: "string" },
    provider: { type: "string" },
    thinking: { type: "string" },
    tier: { type: "string" },
    timeout: { type: "string" },
    wait: { type: "boolean" },
  });
  if (!v.title) die("--title is required");
  const brief = v.brief ?? (v["brief-file"] ? await Bun.file(v["brief-file"]).text() : die("--brief or --brief-file is required"));
  const body = {
    sessionId: v.session ?? process.env.CLAUDE_SESSION_ID ?? "manual",
    cwd: v.cwd ?? process.cwd(),
    title: v.title,
    brief,
    model: v.model,
    provider: v.provider,
    thinking: v.thinking,
    tier: v.tier,
    timeout: v.timeout ? Number(v.timeout) : undefined,
  };
  let run = await (
    await api("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  ).json();
  if (v.wait) run = (await waitAll([run.id]))[0];
  jsonOut(run, !!v.json);
}

async function waitCommand() {
  const { values: v, positionals } = opts({});
  if (!positionals.length) die("run id required");
  jsonOut(await waitAll(positionals), !!v.json);
}

async function statusCommand() {
  const { values: v } = opts({ session: { type: "string" } });
  const sessions = await (await api("/api/sessions")).json();
  const runs = await (
    await api(v.session ? `/api/sessions/${encodeURIComponent(v.session)}/runs` : "/api/runs")
  ).json();
  if (v.json || !process.stdout.isTTY) {
    console.log(JSON.stringify({ sessions, runs }, null, 2));
  } else {
    console.log(`${sessions.length} session(s)\n`);
    console.log(pretty(runs));
  }
}

async function logsCommand() {
  const { values: v, positionals: [id] } = opts({ follow: { type: "boolean" } });
  if (!id) die("run id required");

  if (!v.follow) {
    const text = await (await api(`/api/runs/${id}/events`)).text();
    for (const chunk of text.split("\n\n")) {
      const m = chunk.match(/^event: event\ndata: (.*)$/s);
      if (m) {
        const l = renderEvent(JSON.parse(m[1]));
        if (l) console.log(l);
      }
    }
    return;
  }

  const res = await api(`/api/runs/${id}/events`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop()!;
    for (const f of frames) {
      const m = f.match(/^event: (\w+)\ndata: (.*)$/s);
      if (!m) continue;
      if (m[1] === "event") {
        const l = renderEvent(JSON.parse(m[2]));
        if (l) console.log(l);
      }
      if (m[1] === "status") console.log(`· ${JSON.parse(m[2]).status}`);
    }
  }
}

async function resultCommand() {
  const [id] = rest;
  if (!id) die("run id required");
  process.stdout.write(await (await api(`/api/runs/${id}/result`)).text());
}

async function cancelCommand() {
  const [id] = rest;
  if (!id) die("run id required");
  jsonOut(await (await api(`/api/runs/${id}/cancel`, { method: "POST" })).json(), rest.includes("--json"));
}

(async () => {
  switch (cmd) {
    case "run":
      await runCommand();
      break;
    case "wait":
      await waitCommand();
      break;
    case "status":
      await statusCommand();
      break;
    case "logs":
      await logsCommand();
      break;
    case "result":
      await resultCommand();
      break;
    case "cancel":
      await cancelCommand();
      break;
    case "open":
      Bun.spawn(["xdg-open", BASE]);
      break;
    case "daemon":
      await import("../daemon/main.ts");
      break;
    case "install":
      (await import("./install.ts")).install();
      break;
    default:
      console.log(`sentinel <run|wait|status|logs|result|cancel|open|daemon|install>`);
      process.exit(cmd ? 1 : 0);
  }
})();
