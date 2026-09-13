# Contributing

Thanks for looking. Sentinel is small on purpose; keep it that way.

## Ground rules

- **No frameworks in the UI.** `src/ui/index.html` is plain HTML, CSS and
  JavaScript. No build step.
- **Black and white only.** The one accent is the running-status pulse.
- **Loopback only.** The daemon never binds beyond 127.0.0.1.
- **Every feature has a test.** Unit tests for parsers and the store,
  integration tests through the fake `pi` in `test/fake-pi`.
- **Read DESIGN.md first.** If your change contradicts it, update the
  design in the same pull request and say why.

## Workflow

```bash
bun install
bun test
bun run dev
```

Open a pull request against `main` with a short description of what
changed and how you tested it. Small, focused PRs get merged fastest.

## Reporting issues

Include your Pi version (`pi --version`), Bun version, the provider and
model, and the `events.jsonl` of the run if it is relevant.
