// Shared prose body for the detail panes: the run brief/result and the
// subagent input/output. The empty copy is owned here so every tab reads the
// same. Rendering goes through the house Markdown document renderer.

import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/features/runs/Markdown";

export function Prose({ text, empty }: { text: string; empty: string }) {
  if (!text.trim()) {
    return <p className="px-5 py-4 text-12 text-muted-foreground">{empty}</p>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="px-5 py-4">
        <Markdown text={text} />
      </div>
    </ScrollArea>
  );
}
