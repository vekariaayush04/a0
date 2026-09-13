# Sentinel — design

Date: 2026-09-13
Status: approved in brainstorm, awaiting spec review

## Purpose

Let a Claude Code session (Opus 5 or Fable 5.1) do the planning and hand
execution to headless Pi runs on OpenCode Go, with one local daemon that
owns those runs, remembers which Claude session started them, and serves a
minimal black-and-white UI to browse sessions, runs and live logs.

## Decisions made

| Question | Decision |
|---|---|
| How the skill hands work to Pi | Through the daemon: the skill POSTs a task, the daemon spawns and owns `pi -p`. |
| UI form | Local web app served by the daemon. |
| Which Claude sessions are tracked | Only sessions that dispatched at least one run. No watching of `~/.claude`. |
| Skill scope | Plan, dispatch, wait, review. Parallel runs allowed. |
| Pi provider and model | Default `opencode-go` / `deepseek-v4.1-flash`, overridable per run. |
| Stack | Bun + TypeScript. Bun ships SQLite and an HTTP server, Pi itself is TypeScript. |
| Location | `~/garage/sentinel` |

Out of scope for v1: watching all Claude sessions, auth, remote access,
editing briefs in the UI, OpenRouter (the stored key is dead).

## Components

### sentineld (daemon)

- Bun HTTP server on `127.0.0.1:4747`, run as a systemd user service
  (`sentineld.service`), with `sentinel daemon` as a manual fallback.
- State directory `~/.local/share/sentinel/`:
  - `sentinel.db` — SQLite (bun:sqlite).
  - `runs/<runId>/brief.md`, `events.jsonl` (raw Pi JSON events),
    `stderr.log`, `result.md`, `pi-session/` (Pi's own session dir via
    `--session-dir`).
- Spawns runs as
  `pi -p --mode json --session-dir <runDir>/pi-session --provider <p> --model <m> --thinking <level> -- @brief.md`
  with `cwd` set to the run's working directory. The brief is attached as a
  file argument rather than inline to avoid argument length limits.
- Parses each stdout line as a Pi event. `session` gives the Pi session id;
  `message_end` with role assistant gives text, usage and cost; tool call
  events are stored verbatim; `agent_end` plus process exit finalises the run.
  The final assistant text becomes `result.md`.
- Concurrency cap of 4 running processes, FIFO queue beyond that.
  Per-run timeout, default 30 minutes.
- Broadcasts events to SSE subscribers per run and a global SSE feed for
  list updates.

### sentinel (CLI)

Thin HTTP client used by the skill and by humans. All commands print JSON
with `--json` (default when stdout is not a TTY).

```
sentinel run --session <claudeSessionId> --cwd <dir> --title <t> --brief-file <f> [--model m] [--provider p] [--thinking l] [--wait] [--timeout s]
sentinel wait <runId...>          # blocks until all given runs finish, prints results
sentinel status [--session id]    # sessions and runs summary
sentinel logs <runId> [--follow]  # events rendered as text
sentinel result <runId>           # prints result.md
sentinel cancel <runId>
sentinel open                     # opens the UI in the browser
sentinel daemon                   # runs the daemon in the foreground
```

### Claude skill `~/.claude/skills/sentinel/SKILL.md`

Trigger: user asks to execute, build or research via Pi, or says
"sentinel" or "dispatch". Steps the skill instructs Claude to follow:

1. Derive the Claude session id from the scratchpad path
   (`.../<sessionId>/scratchpad`).
2. Plan the work. Split into units that do not touch the same files.
3. For each unit write a brief in the scratchpad: goal, context, files,
   constraints, acceptance criteria, what to report back.
4. `sentinel run` each brief with `--cwd` set to the project. Fire
   independent units in one Bash call so they run in parallel.
5. `sentinel wait` on the run ids.
6. Read results, verify independently (tests, diff, build). If a unit
   failed or is incomplete, write a follow-up brief and dispatch again.
7. Report to the user with run ids and the UI link.

Rules: heavy reasoning stays in Claude; Pi runs get concrete, bounded
briefs; never dispatch a brief without acceptance criteria; the user can
name a model and it goes into `--model`.

### UI

Single `index.html` served at `/`, no framework, no build step.

- Palette: pure black and white only. Dark mode is white on black, light
  mode is black on white, following `prefers-color-scheme`. One accent
  exists only as the pulsing dot on a running run.
- Type: system stack (`-apple-system, "SF Pro Text", Inter, system-ui`),
  tight tracking on headings, generous spacing, hairline 1px dividers at
  low opacity.
- Layout: three panes. Left rail lists Claude sessions with cwd basename
  and last activity. Middle lists that session's runs with title, status,
  model, duration and cost. Right shows the selected run: brief collapsed
  at the top, live log below streamed over SSE. Tool calls collapse to one
  line and expand on click; assistant text renders as markdown; a quiet
  footer shows tokens, cost, duration and exit code.
- Keyboard: `j`/`k` move within the focused pane, `Enter` moves right,
  `Esc` moves left, `c` cancels a running run with a confirmation.
- Collapses to one pane on narrow widths.

## Data model

```
sessions(id TEXT PK, cwd TEXT, title TEXT, first_seen INT, last_seen INT)
runs(id TEXT PK, session_id TEXT FK, title TEXT, cwd TEXT, provider TEXT,
     model TEXT, thinking TEXT, status TEXT, created INT, started INT,
     ended INT, exit_code INT, pi_session_id TEXT, result TEXT,
     input_tokens INT, output_tokens INT, cost REAL, error TEXT)
```

Status values: `queued`, `running`, `done`, `failed`, `cancelled`.
Run ids are short, sortable (time-prefixed base32), so humans can type them.

## HTTP API

```
POST /api/runs                 body: {sessionId, cwd, title, brief, model?, provider?, thinking?, timeout?}
GET  /api/runs/:id
GET  /api/runs/:id/wait?timeout=<s>   long-poll until terminal
GET  /api/runs/:id/events      SSE: replay events.jsonl then live
GET  /api/runs/:id/result
POST /api/runs/:id/cancel
GET  /api/sessions
GET  /api/sessions/:id/runs
GET  /api/events               SSE: run status changes for list refresh
GET  /                         UI
```

Errors are JSON `{error: string}` with 4xx/5xx. The daemon binds to
loopback only.

## Failure handling

- Pi exits non-zero or emits an error stop reason: run becomes `failed`
  with the last 20 lines of stderr or the error message in `error`.
- Timeout: SIGTERM, 5s grace, SIGKILL, status `failed`, error `timeout`.
- Cancel: same signal sequence, status `cancelled`.
- Daemon restart: on boot every run still marked `running` or `queued` is
  set to `failed` with error `daemon restarted`. Pi children are in the
  daemon's process group and die with it.
- Missing `pi` binary or provider auth failure surfaces as a `failed` run
  with the error text, and the UI shows it.

## Testing

- Unit: Pi event parser (fixtures from real `pi -p --mode json` output),
  store operations, run id generation, queue and concurrency cap.
- Integration: start the daemon with `SENTINEL_PI_BIN` pointing at a fake
  `pi` script that emits canned events and sleeps, then exercise run,
  wait, cancel, timeout and SSE through the CLI.
- Smoke: one real run through OpenCode Go with `deepseek-v4.1-flash`.
- UI: manual check in light and dark, narrow and wide.

## Repository layout

```
sentinel/
  package.json
  src/daemon/   server.ts, runner.ts, store.ts, events.ts, sse.ts
  src/cli/      main.ts
  src/ui/       index.html
  skill/        SKILL.md          (symlinked into ~/.claude/skills/sentinel)
  systemd/      sentineld.service
  test/
  docs/superpowers/specs/
```
