// Display formatting helpers.

/** Duration: ms under 10s keeps one decimal, then whole seconds, then m/m s.
 *  Rounds to the nearest second before splitting into minutes so 119.6s -> "2m". */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const value = Math.max(0, ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) {
    return value < 10000 ? `${(value / 1000).toFixed(1)}s` : `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** Cost: three decimals at or above a cent, four below (so tiny runs stay legible). */
export function fmtCost(cost: number | null | undefined): string {
  const value = cost ?? 0;
  if (!Number.isFinite(value)) return "$0.00";
  const digits = Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 4 : 3;
  return `$${value.toFixed(digits)}`;
}

/** Relative timestamp: "just now", "3m", "2h", "5d". */
export function ago(ts: number | null | undefined, now: number = Date.now()): string {
  if (ts === null || ts === undefined) return "";
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Collapse a macOS/Linux home directory prefix to `~`. */
export function shortPath(path: string | null | undefined): string {
  if (!path) return "";
  const match = path.match(/^(\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/);
  if (match) return `~${path.slice(match[1].length)}`;
  return path;
}

/** Last path segment, for compact labels. */
export function baseName(path: string | null | undefined): string {
  if (!path) return "";
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}
