// Keyboard shortcut sheet, opened with `?` or the sidebar footer button.
// Radix Dialog gives us focus trapping and Escape for free; App still owns the
// `?` key so the store flag stays the single source of truth.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KEYS: Array<[string, string]> = [
  ["j / k", "Move within the current pane"],
  ["Enter", "Open the selection"],
  ["Esc", "Back, or close an overlay"],
  ["c", "Cancel the selected run"],
  ["t", "Cycle theme"],
  ["⌘K / Ctrl K", "Command palette"],
  ["?", "This dialog"],
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4 rounded-xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-15">Keyboard</DialogTitle>
          <DialogDescription className="text-11">
            Shortcuts work anywhere outside a text field.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5">
          {KEYS.map(([key, description]) => (
            <li
              key={key}
              className="flex items-center justify-between gap-4 rounded-md px-1 py-0.5"
            >
              <kbd className="inline-flex h-5 shrink-0 items-center rounded-md border border-border bg-muted px-1.5 font-mono text-10 text-muted-foreground">
                {key}
              </kbd>
              <span className="text-11 text-muted-foreground">{description}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
