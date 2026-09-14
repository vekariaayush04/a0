// Run detail pane: composes Header, Brief, Timeline, Log and StatsStrip for
// the run selected in the store (`#/r/<id>`). Leaves read their data from the
// shared controller in ./data, so this is a layout component.

import { useStore } from "../../state/store";
import { Empty } from "../../ui/Empty";
import { useRunDetail } from "./data";
import { Header } from "./Header";
import { Brief } from "./Brief";
import { Timeline } from "./Timeline";
import { Log } from "./Log";
import { StatsStrip } from "./StatsStrip";

export function RunDetail() {
  const runId = useStore((store) => store.selectedRun);
  const { run } = useRunDetail();

  if (!runId && !run) {
    return <Empty title="Select a run" hint="Choose a run to see its log." />;
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      <Brief />
      <Timeline />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Log />
      </div>
      <StatsStrip />
    </div>
  );
}

export default RunDetail;
