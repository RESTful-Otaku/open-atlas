/**
 * Time-based event retention for the dashboard projection.
 */
import {
  CLIENT_RETENTION_MS,
  MAX_EVENTS,
  MAX_EVENTS_HARD_CEILING,
} from "./data-limits";
import { parseEventMs } from "./map/map-sim-time";
import type { UiEvent } from "./types";

export type TrimEventsByRetentionOptions = {
  nowMs?: number;
  windowMs?: number;
  /** Typical cap after retention (server ring size). */
  softMax?: number;
  /** Hard memory ceiling (newest by ordinal). */
  hardMax?: number;
};

/**
 * Keep events with `timestamp >= now - window`, newest ordinal first.
 * Applies `softMax` when the in-window set is larger, then `hardMax`.
 */
export function trimEventsByRetention(
  events: readonly UiEvent[],
  options: TrimEventsByRetentionOptions = {},
): UiEvent[] {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = options.windowMs ?? CLIENT_RETENTION_MS;
  const softMax = options.softMax ?? MAX_EVENTS;
  const hardMax = options.hardMax ?? MAX_EVENTS_HARD_CEILING;
  const cutoff = nowMs - windowMs;

  const inWindow: UiEvent[] = [];
  for (const e of events) {
    const t = parseEventMs(e.timestamp);
    if (t === null || t < cutoff) continue;
    inWindow.push(e);
  }

  inWindow.sort((a, b) => b.ordinal - a.ordinal);

  if (inWindow.length > hardMax) return inWindow.slice(0, hardMax);
  if (inWindow.length > softMax) return inWindow.slice(0, softMax);
  return inWindow;
}
