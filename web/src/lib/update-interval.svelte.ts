/**
 * User-controlled cadence for dashboard trim, chart revisions, and ingest polls.
 */
import {
  resetDashboardFlushSchedule,
  scheduleDashboardFlush,
} from "./dashboard-flush";
import {
  DEFAULT_UPDATE_INTERVAL_ID,
  UPDATE_INTERVAL_OPTIONS,
  type UpdateIntervalId,
} from "./update-interval-presets";
import { syncIngestPollCadenceFromClient } from "./update-cadence-sync";

export { UPDATE_INTERVAL_OPTIONS, type UpdateIntervalId } from "./update-interval-presets";

const STORAGE_KEY = "openatlas-update-interval";

function loadStored(): UpdateIntervalId {
  if (typeof localStorage === "undefined") return DEFAULT_UPDATE_INTERVAL_ID;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (UPDATE_INTERVAL_OPTIONS.some((o) => o.id === raw)) {
      return raw as UpdateIntervalId;
    }
  } catch {
    /* private mode */
  }
  return DEFAULT_UPDATE_INTERVAL_ID;
}

export const updateInterval = $state<{ id: UpdateIntervalId }>({
  id: loadStored(),
});

let cadenceInterval: number | undefined;

/** Periodic flush so chart cadence applies even between sparse STDB ticks. */
export function restartDashboardFlushCadence(): void {
  if (cadenceInterval !== undefined) {
    clearInterval(cadenceInterval);
    cadenceInterval = undefined;
  }
  if (typeof window === "undefined") return;
  const ms = Math.max(250, getUpdateIntervalMs());
  cadenceInterval = window.setInterval(() => {
    scheduleDashboardFlush();
  }, ms);
}

export function installDashboardFlushCadence(): void {
  restartDashboardFlushCadence();
}

export function getUpdateIntervalMs(): number {
  const hit = UPDATE_INTERVAL_OPTIONS.find((o) => o.id === updateInterval.id);
  return hit?.ms ?? 5_000;
}

export function getUpdateIntervalLabel(): string {
  const hit = UPDATE_INTERVAL_OPTIONS.find((o) => o.id === updateInterval.id);
  return hit?.label ?? "Every 5 seconds";
}

export function setUpdateInterval(id: UpdateIntervalId): void {
  updateInterval.id = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* */
  }
  resetDashboardFlushSchedule();
  restartDashboardFlushCadence();
  void syncIngestPollCadenceFromClient(getUpdateIntervalMs());
}

/** Apply stored cadence on boot (chart timer + ingest poll config). */
export function applyStoredUpdateCadence(): void {
  restartDashboardFlushCadence();
  void syncIngestPollCadenceFromClient(getUpdateIntervalMs());
}
