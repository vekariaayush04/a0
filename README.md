# Sentinel

**Plan in Claude. Execute in Pi. Watch everything from one place.**

Sentinel is a small local daemon, a CLI, a Claude Code skill and a
black-and-white web UI. Together they let a Claude Code session (Opus 5 or
Fable 5.1) do the thinking and hand the actual work to headless
[Pi](https://pi.dev) agents running on cheaper models, while you follow
every run, its log and its cost from a single page.

```
Claude Code session ──(skill)──▶ sentinel CLI ──▶ sentineld ──▶ pi -p --mode json
                                                     │
                                                     └──▶ http://127.0.0.1:4747  (UI, live logs)
```

## Why

Frontier models are great planners and reviewers and expensive executors.
Pi runs happily on OpenCode Go, OpenRouter or any provider it supports, in
headless mode, with structured JSON output. Sentinel is the glue: it gives
Claude a way to dispatch bounded tasks, wait for them, read the results and
iterate, and it remembers which Claude session started which runs so you
can always find them again.

## What you get

- **sentineld** — a daemon that spawns and owns Pi runs, caps concurrency,
  stores every event, and serves the UI. Loopback only.
- **sentinel** — a CLI for humans and for Claude: `run`, `wait`, `status`,
  `logs`, `result`, `cancel`, `open`.
- **A Claude Code skill** — Claude plans, writes one brief per independent
  unit of work, fires them in parallel, waits, verifies, and reports.
- **The UI** — one HTML file, no framework. Sessions on the left, runs in
  the middle, the live log on the right. Pure black and white.

## Requirements

- [Bun](https://bun.sh) 1.2 or newer
- [Pi](https://pi.dev) 0.85 or newer, authenticated with at least one
  provider (`pi auth`)
- Claude Code, if you want the skill (the daemon and UI work without it)

## Install

```bash
git clone git@github.com:vekariaayush04/sentinel.git
cd sentinel
bun install
bun link            # puts `sentinel` on your PATH
sentinel install    # user systemd service + Claude skill symlink
sentinel open       # opens the UI
```

`sentinel install` writes and enables the `sentineld` systemd user
service, restarting it if it was already running, symlinks
`~/.local/bin/sentinel` onto your PATH, and symlinks the Claude skill into
`~/.claude/skills/sentinel`.

Without systemd, run `sentinel daemon` in a terminal instead.

## Usage

From any shell:

```bash
sentinel run --title "Add pagination to /users" --brief-file brief.md --cwd ~/code/api --wait
sentinel status
sentinel logs <runId> --follow
```

From Claude Code, just ask:

> Use sentinel to implement the plan. Split it into independent runs.

Claude derives its own session id, writes the briefs, dispatches, waits,
reads the results and tells you where to look.

### Choosing a model

The default is `opencode-go` / `deepseek-v4.1-flash`. Override per run with
`--provider` and `--model`, or tell Claude which model to use and the skill
passes it through. Any provider Pi can authenticate works.

### Model tiers

Instead of naming a model, pass `--tier l1|l2|l3`:

- `l1` — Muse Spark (`muse-spark-1.3-contributor`), cheap: read-only briefs
  such as scouting a codebase, summarising files, or research.
- `l2` — DeepSeek (`deepseek-v4.1-flash`), the default: editing, tests,
  builds.
- `l3` — GLM 5.3 (`glm-5.3`), strongest: unclear-cause debugging and
  tricky refactors, or anything an `l2` run failed twice.

The skill picks the tier for you based on the brief and escalates one tier
after a failure. Pi runs may also spawn pi-subagents at a different model
(for example, a scout subagent at `muse-spark-1.3-contributor`) within a
single run.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SENTINEL_PORT` | `4747` | Daemon port on 127.0.0.1 |
| `SENTINEL_HOME` | `~/.local/share/sentinel` | Database and run folders |
| `SENTINEL_PI_BIN` | `pi` | Pi executable |
| `SENTINEL_PROVIDER` | `opencode-go` | Default provider |
| `SENTINEL_MODEL` | `deepseek-v4.1-flash` | Default model |
| `SENTINEL_THINKING` | `high` | Default thinking level |
| `SENTINEL_CONCURRENCY` | `4` | Max simultaneous Pi processes |
| `SENTINEL_TIMEOUT` | `1800` | Per-run timeout in seconds |
| `SENTINEL_TIER_L1` | `muse-spark-1.3-contributor` | Model for `--tier l1` |
| `SENTINEL_TIER_L2` | `deepseek-v4.1-flash` (`SENTINEL_MODEL`) | Model for `--tier l2` |
| `SENTINEL_TIER_L3` | `glm-5.3` | Model for `--tier l3` |
| `SENTINEL_URL` | `http://127.0.0.1:${SENTINEL_PORT ?? 4747}` | CLI-only: base URL the CLI talks to |

## How a run works

1. The CLI posts the brief to the daemon with the Claude session id and cwd.
2. The daemon queues it, then spawns
   `pi -p --mode json --session-dir <runDir>/pi-session --provider … --model …`
   with the brief passed inline as the last argument.
3. Every JSON event Pi prints is appended to `events.jsonl` and streamed to
   the UI over SSE.
4. On exit, the final assistant message becomes `result.md`, tokens and cost
   are recorded, and anyone waiting on the run is released.

Failures are explicit: non-zero exit, timeout, cancel and daemon restart
each leave a run in `failed` or `cancelled` with a reason.

## Security

Sentinel binds to `127.0.0.1` only and has no authentication — anything
that can reach the port can drive it. The API rejects cross-origin browser
requests (a mismatched `Origin` header gets a 403) and non-JSON POST
bodies (a 415), which blocks the common ways a malicious web page could
abuse it, but there is no protection against another local user or
process on the same machine. Do not expose the port beyond loopback.

## Development

```bash
bun test            # unit + integration (uses a fake pi)
bun run dev         # daemon with reload
```

See [DESIGN.md](DESIGN.md) for the architecture and the decisions behind
it, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT. See [LICENSE](LICENSE).
