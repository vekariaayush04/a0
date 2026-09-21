// shadcn/ui `resizable`, adapted to react-resizable-panels v4.
//
// v4 renamed the primitives (PanelGroup -> Group, PanelResizeHandle ->
// Separator) and takes `orientation` instead of `direction`. The shadcn names
// are kept as the public surface so screens read like the upstream docs, and
// so a later upgrade is a one-file change.
//
// Sizes in v4 accept explicit units: `minSize="340px"` really means 340px, no
// percentage maths at the call site.

import * as React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<
  React.ComponentProps<typeof Group>,
  "orientation"
> & {
  direction?: "horizontal" | "vertical";
};

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) => (
  <Group
    orientation={direction}
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col",
      className,
    )}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) => (
  <Separator
    className={cn(
      "relative flex w-px shrink-0 items-center justify-center bg-border",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
      "transition-colors duration-150 hover:bg-foreground/25 data-[state=drag]:bg-foreground/40",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full",
      "data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-3",
      "data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2",
      "data-[orientation=vertical]:after:translate-x-0",
      className,
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-5 w-3 items-center justify-center rounded-sm border border-border bg-card">
        <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
      </div>
    ) : null}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
