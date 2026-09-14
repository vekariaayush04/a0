// Keyboard shortcut overlay toggled from the TopBar `?` button.

import { useKeys } from "../lib/keys";
import { X } from "../ui/icons";
import { Kbd } from "../ui/Kbd";

const KEYS: Array<[string, string]> = [
  ["j / k", "move within pane"],
  ["Enter", "open selection"],
  ["Esc", "back / close"],
  ["c", "cancel run"],
  ["g", "toggle list / tree"],
  ["t", "cycle theme"],
  ["?", "toggle this overlay"],
];

export function KeyOverlay({ onClose }: { onClose: () => void }) {
  useKeys({ Escape: onClose, "?": onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-sm rounded-10 border border-line bg-raised p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-15 font-semibold text-fg">Keyboard</h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded-6 p-1 text-fg3 transition-colors duration-150 hover:bg-hover hover:text-fg"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {KEYS.map(([key, description]) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <Kbd>{key}</Kbd>
              <span className="text-12 text-fg2">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
