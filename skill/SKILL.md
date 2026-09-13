---
name: sentinel
description: Plan work in this Claude session and execute it through headless Pi runs tracked by the Sentinel daemon. Use when the user asks to dispatch, delegate, execute, build or research via Pi or Sentinel, or wants parallel execution on a cheaper model.
---

# Sentinel: plan here, execute in Pi

You are the planner and reviewer. Pi runs are the executors. Keep the
heavy reasoning in this session; give Pi concrete, bounded briefs.

## Session id

Your scratchpad path in the system prompt looks like
`/tmp/claude-1000/<project>/<sessionId>/scratchpad`. The `<sessionId>`
segment is the Claude session id. Pass it as `--session` on every run so
the UI groups your runs under this session.

## Procedure

1. **Plan.** Understand the task, read the code that matters, and split
   the work into units that do not edit the same files. If units depend
   on each other, dispatch them in waves.
2. **Write briefs.** One markdown file per unit in your scratchpad, named
   `brief-<n>-<slug>.md`, containing these headings in this order:
   `Goal`, `Context` (paths, how the code works, decisions already made),
   `Do` (numbered concrete steps), `Do not` (files or behaviours to leave
   alone), `Acceptance` (commands to run and what must be true),
   `Report` (ask Pi to end with a short summary: what changed, what was
   verified, anything left open). Never dispatch a brief without an
   `Acceptance` section.
3. **Dispatch.** In one Bash call, fire every unit of the wave:
   ```bash
   sentinel run --session <sessionId> --cwd <project> --title "<short title>" --brief-file <scratchpad>/brief-1-x.md --json
   sentinel run --session <sessionId> --cwd <project> --title "<short title>" --brief-file <scratchpad>/brief-2-y.md --json
   ```
   Each prints a run JSON with an `id`. On the first dispatch of a session,
   also pass `--session-title "<5-8 word summary of the user's task>"` so
   the session reads clearly in the UI's session list.

   **Model tiers.** Sentinel has three tiers, configured in the daemon:
   - `--tier l1` (cheap, Muse Spark): the brief is mostly reading.
     Rule of thumb: it asks Pi to read or summarise more than ~10 files,
     or it is research, scouting, log analysis, or fact collection with
     at most trivial edits.
   - `--tier l2` (default, DeepSeek): editing code, running tests, builds.
   - `--tier l3` (strong, GLM 5.3): debugging with unclear cause, tricky
     refactors, anything a previous l2 run failed twice.
   - The user named a model: pass `--model <m>` instead of a tier.
   Escalate one tier after a failure; never start at l3.

   **Pi can fan out.** Pi has the pi-subagents extension. For a brief that
   mixes heavy reading with editing, dispatch at l2 and tell Pi in the `Do`
   section: "use the scout subagent with model muse-spark-1.3-contributor
   to map the code first, then edit".
4. **Wait.** `sentinel wait <id1> <id2> ...` blocks until every run is
   terminal and prints their final state, including `result`.
5. **Verify yourself.** Do not trust the summary. Run the acceptance
   commands, read `git diff`, run tests. For a failed or incomplete run
   read `sentinel logs <id>` and `sentinel result <id>`.
6. **Iterate.** Write a follow-up brief that names exactly what is
   missing and dispatch again. Do not re-send the whole original brief.
7. **Report.** Tell the user what was built, what you verified, the run
   ids, and that details are at http://127.0.0.1:4747 (or the port in
   SENTINEL_PORT).

## Rules

- If `sentinel` reports it cannot reach the daemon, run
  `sentinel install` once, or `sentinel daemon` in the background, then
  retry.
- Briefs under 100 000 characters. Put big context in files in the
  project and reference the paths instead.
- Do not dispatch destructive operations (deleting branches, force
  pushes, dropping data). Do those yourself with the user's approval.
- One run per unit of work. A brief that says "and also" is two briefs.
