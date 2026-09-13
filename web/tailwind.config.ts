import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        fg: "var(--fg)",
        fg2: "var(--fg-2)",
        fg3: "var(--fg-3)",
        fg4: "var(--fg-4)",
        line: "var(--line)",
        hover: "var(--hover)",
        raised: "var(--raised)",
        accent: "var(--accent)",
      },
      fontFamily: {
        sans: ['-apple-system', '"SF Pro Text"', '"SF Pro Display"', "system-ui", "sans-serif"],
        mono: ['ui-monospace', '"SF Mono"', "Menlo", "monospace"],
      },
      fontSize: {
        "10": "10px",
        "11": "11px",
        "12": "12px",
        "13": "13px",
        "15": "15px",
        "20": "20px",
        "26": "26px",
      },
      borderRadius: {
        "6": "6px",
        "10": "10px",
      },
      spacing: {
        "4.5": "18px",
      },
    },
  },
  plugins: [],
} satisfies Config;
