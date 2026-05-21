/**
 * Fills the reactive dashboard with `buildDemoSnapshot()` and sets
 * `dataMode: "demo"`. SpacetimeDB is not used in this mode.
 */

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

/**
 * Project synthetic data into the global dashboard (same shape as STDB
 * projection). Idempotent: replaces lists and domain maps.
 */
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
