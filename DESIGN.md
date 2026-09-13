# Sentinel — design

This is the working design document. It records the decisions behind the
code; the README covers usage.

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
  `pi -p --mode json --session-dir <runDir>/pi-session --provider <p> --model <m> --thinking <level> -- <brief text>`
  with `cwd` set to the run's working directory. The brief is passed inline
  as the final argument (not as a `@brief.md` file reference); a copy is
  still written to `<runDir>/brief.md` for inspection. Briefs are capped
  at 100 000 characters.
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
sentinel run --session <claudeSessionId> --cwd <dir> --title <t> [--brief-file <f> | --brief <text>] [--model m] [--tier l1|l2|l3] [--provider p] [--thinking l] [--session-title <t>] [--wait] [--timeout s] [--json]
sentinel wait <runId...>          # blocks until all given runs finish, prints results
sentinel status [--session id]    # sessions and runs summary
sentinel logs <runId> [--follow]  # events rendered as text
sentinel result <runId>           # prints result.md
sentinel cancel <runId>
sentinel open                     # opens the UI in the browser
sentinel daemon                   # runs the daemon in the foreground
sentinel install                  # writes the systemd user unit, enables it, symlinks the skill
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

**Model tiers.** The skill picks `--tier l1|l2|l3` per brief: `l1` (Muse
Spark) for read-heavy briefs — reading or summarising more than ~10 files,
research, scouting, log analysis, fact collection with at most trivial
edits; `l2` (DeepSeek, the default) for editing code, running tests and
builds; `l3` (GLM 5.3) for debugging with unclear cause, tricky refactors,
or anything a previous `l2` run failed twice. The skill escalates one tier
after a failure and never starts at `l3`. A user-named model overrides the
tier via `--model`. Pi's pi-subagents extension lets a single `l2` run fan
out a read-heavy scout at `muse-spark-1.3-contributor` before editing.

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
  line and expand on click; assistant text is shown preformatted (no
  markdown rendering in v1); a quiet footer shows tokens, cost, duration
  and exit code.
- Keyboard: `j`/`k` move within the focused pane, `Enter` moves right,
  `Esc` moves left, `c` cancels a running run with a confirmation.
- Collapses to one pane on narrow widths.

## Configuration

Environment variables, all optional: `SENTINEL_PORT` (4747), `SENTINEL_HOME`
(`~/.local/share/sentinel`), `SENTINEL_PI_BIN` (`pi`), `SENTINEL_PROVIDER`
(`opencode-go`), `SENTINEL_MODEL` (`deepseek-v4.1-flash`), `SENTINEL_THINKING`
(`high`), `SENTINEL_CONCURRENCY` (4), `SENTINEL_TIMEOUT` (1800 seconds).

`SENTINEL_URL` is CLI-only: overrides the base URL the CLI talks to,
default `http://127.0.0.1:${SENTINEL_PORT ?? 4747}`. Useful for pointing
the CLI at a daemon on a non-default port without changing `SENTINEL_PORT`
(which the daemon itself would also pick up).

**Model tiers.** `SENTINEL_TIER_L1` (`muse-spark-1.3-contributor`),
`SENTINEL_TIER_L2` (defaults to `SENTINEL_MODEL`, i.e. `deepseek-v4.1-flash`),
`SENTINEL_TIER_L3` (`glm-5.3`). `sentinel run --tier l1|l2|l3` resolves to
the corresponding model; `--model` overrides a tier when set.

## Data model

```
sessions(id TEXT PK, cwd TEXT, title TEXT, first_seen INT, last_seen INT)
runs(id TEXT PK, session_id TEXT FK, title TEXT, cwd TEXT, provider TEXT,
     model TEXT, thinking TEXT, status TEXT, created INT, started INT,
     ended INT, exit_code INT, pi_session_id TEXT, result TEXT,
     input_tokens INT, output_tokens INT, cost REAL, error TEXT)
```

Status values: `queued`, `running`, `done`, `failed`, `cancelled`.
Run ids are short, sortable (time-prefixed base36), so humans can type them.

`cwd` on a session is set once, from the first run that ever touched it,
and never overwritten by later runs in the same session. `title` is the
explicit `sessionTitle` if one was ever given (on any run in the
session — the latest one wins), else the dirname of the nearest ancestor
of that first `cwd` containing a `.git` (walking up), else `basename(cwd)`.

`GET /api/sessions` does not read the table directly: each session is
joined with an aggregate over its runs — `runCount`, `runningCount`
(status `running` or `queued`), `totalCost` (sum of `cost`), and `cwds`
(distinct run cwds, oldest first) — computed at request time since
sessions are few.

Every event line appended to `events.jsonl` and published on the bus
carries `ts` (epoch ms), stamped by the daemon the moment it parses the
line off Pi's stdout — not whatever timestamp Pi itself may include.
Replayed events carry the stored `ts`.

### Spawn tree

Pi's own pi-subagents extension lets one run fan a subagent out mid-flight
(e.g. an `l2` run launching a read-heavy `scout` before it edits); each
subagent writes its own `_meta.json`, `_input.md`, `_output.md` and
`_transcript.jsonl` into that run's `pi-session/subagent-artifacts/`. The
tree endpoints reconstruct this as a tree, purely by reading a run's own
`events.jsonl` (for its top-level tool calls and its `subagent` tool-call
spawns) and that artifacts directory (for each child's status, cost,
turns and its own tool calls, parsed from its transcript) — no separate
storage. `GET /api/runs/:id/tree` returns the run plus its subagent
children (recursing into any nested spawn-of-a-spawn artifacts);
`GET /api/sessions/:id/tree` stacks every run in a session, oldest first;
`GET /api/runs/:id/subagents/:index/transcript` returns one subagent's
full transcript, rendered as ordered message and tool records. Trees are
computed on demand and cached in memory by run id once the run is
terminal (a running run's tree is never cached, since its subagent
artifacts are still being written).

## HTTP API

```
POST /api/runs                 body: {sessionId, cwd, title, brief, model?, provider?, thinking?, tier?, timeout?, sessionTitle?}
GET  /api/runs                 list all runs
GET  /api/runs/:id
GET  /api/runs/:id/wait?timeout=<s>   long-poll until terminal
GET  /api/runs/:id/events      SSE: replay events.jsonl then live; ?replay=1 replays then sends `event: done` and closes without subscribing, regardless of status
GET  /api/runs/:id/result
POST /api/runs/:id/cancel
GET  /api/sessions             sessions with run aggregates, see Data model
GET  /api/sessions/:id/runs
GET  /api/runs/:id/tree                          spawn tree for one run, see Spawn tree
GET  /api/sessions/:id/tree                      a session's run trees, stacked in created order
GET  /api/runs/:id/subagents/:index/transcript   one subagent's rendered transcript
GET  /api/stats                {running, queued, runsToday, costToday, totalRuns, totalCost, tiers}; "today" is since local midnight
GET  /api/events               SSE: run status changes for list refresh
GET  /                         UI
```

`sessionTitle`, when given, is trimmed and capped at 200 characters (a
longer one is a 400); it sets or overrides the session's title as of
this run.

Errors are JSON `{error: string}` with 4xx/5xx. The daemon binds to
loopback only. Every non-GET request is checked for CSRF: a present
`Origin` header must match the daemon's own loopback origin, and
`POST /api/runs` requires `content-type: application/json`.

## Failure handling

- Pi exits non-zero or emits an error stop reason: run becomes `failed`
  with the last 20 lines of stderr or the error message in `error`.
- Timeout: SIGTERM, 5s grace, SIGKILL, status `failed`, error `timeout`.
- Cancel: same signal sequence, status `cancelled`.
- Daemon restart: on boot every run still marked `running` or `queued` is
  set to `failed` with error `daemon restarted`.
- Shutdown: graceful shutdown (SIGTERM/SIGINT) calls `runner.shutdown()`,
  which explicitly signals every in-flight child (same SIGTERM/grace/SIGKILL
  path as cancel) and marks those runs `cancelled` with error `cancelled`.
  A crash or an unclean restart instead hits the daemon-restart path above,
  marking them `failed` with `daemon restarted`.
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
  src/daemon/   server.ts, runner.ts, store.ts, events.ts, bus.ts, main.ts
  src/cli/      main.ts
  src/ui/       index.html
  skill/        SKILL.md          (symlinked into ~/.claude/skills/sentinel)
  systemd/      sentineld.service
  test/         fake-pi/ plus unit and integration tests
  DESIGN.md README.md CONTRIBUTING.md LICENSE
```
