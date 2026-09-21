export type Config = {
  port: number; home: string; piBin: string; provider: string; model: string;
  thinking: string; concurrency: number; timeout: number;
  tiers: { l1: string; l2: string; l3: string };
};

const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && Number.isFinite(n) && n > 0 ? n : d; };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const home = env.HOME ?? "/tmp";
  const model = env.A0_MODEL ?? "deepseek-v4.1-flash";
  return {
    port: num(env.A0_PORT, 4747),
    home: env.A0_HOME ?? `${home}/.local/share/a0`,
    piBin: env.A0_PI_BIN ?? "pi",
    provider: env.A0_PROVIDER ?? "opencode-go",
    model: model,
    thinking: env.A0_THINKING ?? "high",
    concurrency: num(env.A0_CONCURRENCY, 4),
    timeout: num(env.A0_TIMEOUT, 1800),
    tiers: {
      l1: env.A0_TIER_L1 ?? "muse-spark-1.3-contributor",
      l2: env.A0_TIER_L2 ?? model,
      l3: env.A0_TIER_L3 ?? "glm-5.3",
    },
  };
}
