// Empty state: a quiet title and an optional hint.

import type { ReactNode } from "react";

export type EmptyProps = {
  title: string;
  hint?: ReactNode;
  className?: string;
};

export function Empty({ title, hint, className = "" }: EmptyProps) {
  return (
    <div className={`flex flex-col items-start gap-1 px-4 py-6 ${className}`}>
      <p className="text-13 text-fg2">{title}</p>
      {hint ? <p className="text-11 text-fg3">{hint}</p> : null}
    </div>
  );
}
