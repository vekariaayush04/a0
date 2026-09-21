import { mkdirSync, writeFileSync, existsSync, symlinkSync, readlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export async function install() {
  const repo = resolve(import.meta.dir, "../..");
  const home = process.env.HOME!;
  const bun = Bun.which("bun") ?? "bun";

  const webDir = join(repo, "web");
  const deps = spawnSync(bun, ["install", "--frozen-lockfile"], { cwd: webDir, stdio: "inherit" });
  if (deps.status !== 0) {
    console.log("web ui deps install failed; continuing (the daemon will serve the legacy page)");
  } else {
    const build = spawnSync(bun, ["run", "build"], { cwd: webDir, stdio: "inherit" }); // bun run build inside web/
    console.log(build.status === 0 ? "web ui built" : "web ui build failed; continuing (the daemon will serve the legacy page)");
  }

  if (process.platform === "darwin") installLaunchAgent(repo, home, bun);
  else await installSystemdUnit(repo, home, bun);

  const skillDir = join(home, ".claude/skills");
  mkdirSync(skillDir, { recursive: true });
  const skillLink = join(skillDir, "a0");
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
  const binLink = join(binDir, "a0");
  const binTarget = join(repo, "src/cli/main.ts");
  if (!existsSync(binLink)) {
    symlinkSync(binTarget, binLink);
    console.log("a0 linked at " + binLink);
  } else if (readlinkSync(binLink) === binTarget) {
    console.log("a0 already linked");
  } else {
    console.log(`${binLink} exists and is not ours; skipped`);
  }

  console.log(`ui: http://127.0.0.1:${process.env.A0_PORT ?? 4747}`);
}

async function installSystemdUnit(repo: string, home: string, bun: string) {
  const unitDir = join(home, ".config/systemd/user");
  mkdirSync(unitDir, { recursive: true });
  const unitText = await Bun.file(join(repo, "systemd/a0d.service")).text();
  writeFileSync(
    join(unitDir, "a0d.service"),
    unitText.replace("%BUN%", bun).replace("%REPO%", repo).replace("%PATH%", process.env.PATH ?? "/usr/bin")
  );
  console.log(`systemd unit written to ${join(unitDir, "a0d.service")}`);

  const r = Bun.spawnSync([
    "sh",
    "-c",
    "systemctl --user daemon-reload && systemctl --user enable --now a0d && systemctl --user restart a0d",
  ]);
  console.log(
    r.exitCode === 0
      ? "a0d enabled and (re)started"
      : `systemd step failed (${r.stderr.toString().trim()}); run \`a0 daemon\` manually`
  );
}

const LAUNCHD_LABEL = "dev.a0.a0d";

function installLaunchAgent(repo: string, home: string, bun: string) {
  const agentDir = join(home, "Library/LaunchAgents");
  const logDir = join(home, "Library/Logs");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  const plistPath = join(agentDir, `${LAUNCHD_LABEL}.plist`);
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  writeFileSync(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(bun)}</string>
    <string>${esc(join(repo, "src/daemon/main.ts"))}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${esc(process.env.PATH ?? "/usr/bin:/bin")}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(join(logDir, "a0d.log"))}</string>
  <key>StandardErrorPath</key><string>${esc(join(logDir, "a0d.log"))}</string>
</dict>
</plist>
`
  );
  console.log(`launch agent written to ${plistPath}`);

  const domain = `gui/${process.getuid?.() ?? 501}`;
  Bun.spawnSync(["launchctl", "bootout", `${domain}/${LAUNCHD_LABEL}`]); // fails harmlessly when not loaded
  const r = Bun.spawnSync(["launchctl", "bootstrap", domain, plistPath]);
  console.log(
    r.exitCode === 0
      ? "a0d loaded and started"
      : `launchctl step failed (${r.stderr.toString().trim()}); run \`a0 daemon\` manually`
  );
}
