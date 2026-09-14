import { mkdirSync } from "node:fs"; import { join } from "node:path";
import { loadConfig } from "../config"; import { Store } from "./store"; import { Bus } from "./bus"; import { Runner, KILL_GRACE_MS } from "./runner"; import { startServer } from "./server"; import { webDistStatus } from "./webdist";
const cfg = loadConfig(); mkdirSync(cfg.home, { recursive: true });
const webDist = join(import.meta.dir, "../../web/dist");
if (webDistStatus(webDist) === "missing") console.log("web ui not built; serving legacy page. Run: bun run web:build");
const store = new Store(join(cfg.home, "sentinel.db"));
const n = store.failInFlight("daemon restarted"); if (n) console.log(`marked ${n} in-flight run(s) failed`);
const bus = new Bus(); const runner = new Runner(store, bus, cfg);
const server = startServer({ store, runner, bus, port: cfg.port, uiPath: join(import.meta.dir, "../ui/index.html"), tiers: cfg.tiers, defaults: { provider: cfg.provider, model: cfg.model, thinking: cfg.thinking } });
console.log(`sentineld listening on http://127.0.0.1:${server.port}`);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  runner.shutdown();
  setTimeout(() => process.exit(0), KILL_GRACE_MS);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
