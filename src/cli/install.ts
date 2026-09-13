import { mkdirSync, writeFileSync, existsSync, symlinkSync, readlinkSync } from "node:fs";
import { join, resolve } from "node:path";

export async function install() {
  const repo = resolve(import.meta.dir, "../..");
  const home = process.env.HOME!;
  const bun = Bun.which("bun") ?? "bun";

  const unitDir = join(home, ".config/systemd/user");
  mkdirSync(unitDir, { recursive: true });
  const unitText = await Bun.file(join(repo, "systemd/sentineld.service")).text();
  writeFileSync(
    join(unitDir, "sentineld.service"),
    unitText.replace("%BUN%", bun).replace("%REPO%", repo).replace("%PATH%", process.env.PATH ?? "/usr/bin")
  );
  console.log(`systemd unit written to ${join(unitDir, "sentineld.service")}`);

  const r = Bun.spawnSync(["sh", "-c", "systemctl --user daemon-reload && systemctl --user enable --now sentineld"]);
  console.log(
    r.exitCode === 0
      ? "sentineld enabled and started"
      : `systemd step failed (${r.stderr.toString().trim()}); run \`sentinel daemon\` manually`
  );

  const skillDir = join(home, ".claude/skills");
  mkdirSync(skillDir, { recursive: true });
  const skillLink = join(skillDir, "sentinel");
  const skillTarget = join(repo, "skill");
  if (!existsSync(skillLink)) {
    symlinkSync(skillTarget, skillLink);
    console.log("skill linked at " + skillLink);
  } else if (readlinkSync(skillLink) === skillTarget) {
    console.log("skill already linked");
  } else {
    console.log(`${skillLink} exists and is not ours; skipped`);
  }

  const binDir = join(home, ".local/bin");
  mkdirSync(binDir, { recursive: true });
  const binLink = join(binDir, "sentinel");
  const binTarget = join(repo, "src/cli/main.ts");
  if (!existsSync(binLink)) {
    symlinkSync(binTarget, binLink);
    console.log("sentinel linked at " + binLink);
  } else if (readlinkSync(binLink) === binTarget) {
    console.log("sentinel already linked");
  } else {
    console.log(`${binLink} exists and is not ours; skipped`);
  }

  console.log(`ui: http://127.0.0.1:${process.env.SENTINEL_PORT ?? 4747}`);
}
