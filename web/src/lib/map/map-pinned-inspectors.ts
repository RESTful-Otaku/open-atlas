/** Pinned map/globe event inspector cards (desktop comparison + mobile single dock). */

export const MAX_MAP_PINS_DESKTOP = 3;
export const MAX_MAP_PINS_COMPACT = 1;

export type PinnedMapInspector = {
  eventId: string;
  x: number;
  y: number;
};

export function maxMapPins(compactLayout: boolean): number {
  return compactLayout ? MAX_MAP_PINS_COMPACT : MAX_MAP_PINS_DESKTOP;
}

export function isEventPinned(
  pins: readonly PinnedMapInspector[],
  eventId: string,
): boolean {
  return pins.some((p) => p.eventId === eventId);
}

export type PinInspectorResult =
  | { ok: true; pins: PinnedMapInspector[]; unpinned: boolean }
  | { ok: false; pins: PinnedMapInspector[]; reason: "max_pins" };

/**
 * Toggle pin for an event. Compact replaces the sole slot; desktop allows up to three.
 */
export function togglePinInspector(
  pins: readonly PinnedMapInspector[],
  next: PinnedMapInspector,
  compactLayout: boolean,
): PinInspectorResult {
  const idx = pins.findIndex((p) => p.eventId === next.eventId);
  if (idx >= 0) {
    const out = pins.filter((_, i) => i !== idx);
    return { ok: true, pins: out, unpinned: true };
  }
  if (compactLayout) {
    return { ok: true, pins: [next], unpinned: false };
  }
  const limit = maxMapPins(false);
  if (pins.length >= limit) {
    return { ok: false, pins: [...pins], reason: "max_pins" };
  }
  return { ok: true, pins: [...pins, next], unpinned: false };
}

export function unpinInspector(
  pins: readonly PinnedMapInspector[],
  eventId: string,
): PinnedMapInspector[] {
  return pins.filter((p) => p.eventId !== eventId);
}

export function unpinLastInspector(
  pins: readonly PinnedMapInspector[],
): PinnedMapInspector[] {
  if (pins.length === 0) return [];
  return pins.slice(0, -1);
}

/** Drop pins whose events left the current map dataset. */
export function prunePinnedInspectors(
  pins: readonly PinnedMapInspector[],
  knownEventIds: ReadonlySet<string>,
): PinnedMapInspector[] {
  return pins.filter((p) => knownEventIds.has(p.eventId));
}
