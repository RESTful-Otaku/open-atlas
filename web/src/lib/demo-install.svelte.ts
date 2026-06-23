

import { bumpDashboardRevision } from "./dashboard-revision.svelte";
import { buildDemoSnapshot } from "./demo-seed";
import { invalidateGeoEventIndex } from "./geo-event-index";
import {
  dashboard,
  rebuildEventIdIndex,
  setConnection,
  setConnectionLastError,
  setSelectedDomain,
} from "./state.svelte";


export function installDemoData(): void {
  const s = buildDemoSnapshot();
  dashboard.events = [...s.events];
  dashboard.recentSignals = [...s.recentSignals];
  dashboard.domainState = { ...s.domainState };
  dashboard.domainSeverityHistory = { ...s.domainSeverityHistory };
  dashboard.recentCausalEdges = [...s.recentCausalEdges];
  dashboard.domainInsights = { ...s.domainInsights };
  dashboard.eventNarratives = { ...s.eventNarratives };
  setSelectedDomain(null);
  setConnectionLastError(null);
  setConnection("offline");
  dashboard.dataMode = "demo";
  rebuildEventIdIndex();
  invalidateGeoEventIndex();
  bumpDashboardRevision();
  if (import.meta.env.DEV) {
    console.info(
      "[openatlas] demo mode",
      dashboard.events.length,
      "events",
    );
  }
}
