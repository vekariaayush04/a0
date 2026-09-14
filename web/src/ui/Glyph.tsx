// Status glyph (12px):
//   queued    hollow ring
//   running   accent pulsing dot
//   done      filled dot
//   failed    ring with X
//   cancelled dim dash

import type { Status } from "../api/types";

export type GlyphProps = {
  status: Status;
  size?: number;
  className?: string;
  title?: string;
};

export function Glyph({ status, size = 12, className = "", title }: GlyphProps) {
  const color =
    status === "running"
      ? "text-live"
      : status === "done"
        ? "text-fg"
        : status === "queued"
          ? "text-fg3"
          : "text-fg4";

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 12 12",
    "aria-hidden": true as const,
    className: `${color} ${className}`.trim(),
  };

  if (status === "running") {
    return (
      <span
        className={`relative inline-flex shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title={title ?? status}
        role="img"
        aria-label={title ?? status}
      >
        <span
          className="pulse absolute inset-0 rounded-full bg-live"
          style={{ width: size, height: size }}
        />
      </span>
    );
  }

  if (status === "done") {
    return (
      <svg {...common} role="img" aria-label={title ?? status}>
        <circle cx="6" cy="6" r="4" fill="currentColor" />
      </svg>
    );
  }

  if (status === "failed") {
    return (
      <svg {...common} role="img" aria-label={title ?? status}>
        <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "cancelled") {
    return (
      <svg {...common} role="img" aria-label={title ?? status}>
        <path d="M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common} role="img" aria-label={title ?? status}>
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
