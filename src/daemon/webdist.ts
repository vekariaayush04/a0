import { existsSync } from "node:fs";
import { join } from "node:path";

/** Status of the built React UI: "ok" once `web/dist/index.html` exists,
 *  "missing" when the daemon has to fall back to `src/ui/index.html`. */
export function webDistStatus(root: string): "ok" | "missing" {
  return existsSync(join(root, "index.html")) ? "ok" : "missing";
}
