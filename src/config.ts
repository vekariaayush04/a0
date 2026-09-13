export type Config = {
  port: number; home: string; piBin: string; provider: string; model: string;
  thinking: string; concurrency: number; timeout: number;
  tiers: { l1: string; l2: string; l3: string };
};

const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && Number.isFinite(n) && n > 0 ? n : d; };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const home = env.HOME ?? "/tmp";
  const model = env.SENTINEL_MODEL ?? "deepseek-v4.1-flash";
  return {
    port: num(env.SENTINEL_PORT, 4747),
    home: env.SENTINEL_HOME ?? `${home}/.local/share/sentinel`,
    piBin: env.SENTINEL_PI_BIN ?? "pi",
    provider: env.SENTINEL_PROVIDER ?? "opencode-go",
    model: model,
    thinking: env.SENTINEL_THINKING ?? "high",
    concurrency: num(env.SENTINEL_CONCURRENCY, 4),
    timeout: num(env.SENTINEL_TIMEOUT, 1800),
    tiers: {
      l1: env.SENTINEL_TIER_L1 ?? "muse-spark-1.3-contributor",
      l2: env.SENTINEL_TIER_L2 ?? model,
      l3: env.SENTINEL_TIER_L3 ?? "glm-5.3",
    },
  };
}
