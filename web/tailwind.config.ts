import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * a0 UI v3.
 *
 * Colour is a single neutral ramp plus one accent (`live`). Every colour here
 * resolves through a CSS variable defined in src/styles.css, so light/dark is
 * a token swap and nothing in component code branches on theme.
 *
 * `accent` is shadcn's *hover surface*, not the blue. The blue is `live` and
 * is only ever used for running state.
 */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /** The one accent. Live/running only. */
        live: {
          DEFAULT: "hsl(var(--live))",
          foreground: "hsl(var(--live-foreground))",
        },
        /** Elevation ramp for layout chrome. */
        elev: {
          0: "hsl(var(--elev-0))",
          1: "hsl(var(--elev-1))",
          2: "hsl(var(--elev-2))",
        },
        // ---- legacy a0 tokens (Tree / Subagent screens) ----
        bg: "var(--bg)",
        fg: "var(--fg)",
        fg2: "var(--fg-2)",
        fg3: "var(--fg-3)",
        fg4: "var(--fg-4)",
        line: "var(--line)",
        hover: "var(--hover)",
        raised: "var(--raised)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "6": "6px",
        "10": "10px",
      },
      fontFamily: {
        sans: ["Geist Sans", "-apple-system", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "10": ["10px", { lineHeight: "14px" }],
        "11": ["11px", { lineHeight: "16px" }],
        "12": ["12px", { lineHeight: "18px" }],
        "13": ["13px", { lineHeight: "20px" }],
        "15": ["15px", { lineHeight: "22px" }],
        "20": ["20px", { lineHeight: "28px" }],
        "26": ["26px", { lineHeight: "32px" }],
      },
      spacing: {
        "4.5": "18px",
        sidebar: "260px",
      },
      boxShadow: {
        /** The only shadow in the system. Popovers, sheets, command palette. */
        float: "0 16px 48px -12px hsl(0 0% 0% / 0.45), 0 0 0 1px hsl(var(--border))",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
