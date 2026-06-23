import { DOMAIN_CATALOG } from "../colors";
import type { PinnedMapInspector } from "./map-pinned-inspectors";

const STORAGE_KEY = "openatlas-map-view:v1";
const LEGACY_DOMAINS_KEY = "openatlas-map-domains";

const ALL_IDS: readonly string[] = DOMAIN_CATALOG.map((d) => d.id);
const VALID_DOMAINS = new Set(ALL_IDS);

export type MapDisplayMode = "heat" | "points" | "both";

export type MapViewPersistState = {
  domains: Set<string>;
  mode: MapDisplayMode;
  showTerminator: boolean;
  showSubsun: boolean;
  showMoon: boolean;
  showCausal: boolean;
  showPhotorealEarth: boolean;
  showDemoLayers: boolean;
  showWeatherOverlays: boolean;
  showPublicTracking: boolean;
  simDayStart: number;
  simMinOfDay: number;
  pins: PinnedMapInspector[];
};

type PersistedJson = {
  v: 1;
  domains: string[];
  mode: MapDisplayMode;
  showTerminator: boolean;
  showSubsun: boolean;
  showMoon: boolean;
  showCausal: boolean;
  showPhotorealEarth: boolean;
  showDemoLayers: boolean;
  showWeatherOverlays: boolean;
  showPublicTracking: boolean;
  simDayStart: number;
  simMinOfDay: number;
  pins: Array<{ eventId: string; x: number; y: number }>;
};

function utcDayStartMs(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function currentSimMinOfDay(): number {
  const d = new Date();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function defaultMapDomainSet(): Set<string> {
  return new Set();
}

export function allDomainIds(): readonly string[] {
  return ALL_IDS;
}

export function isMapDomainEnabled(
  mapDomains: ReadonlySet<string>,
  domainId: string,
): boolean {
  return mapDomains.has(domainId);
}

export function mapDomainsActiveLabel(mapDomains: ReadonlySet<string>): string {
  const total = ALL_IDS.length;
  if (mapDomains.size === 0) return "None";
  if (mapDomains.size >= total) return "All";
  return `${mapDomains.size} of ${total}`;
}

function parseDomainIds(arr: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(arr)) return out;
  for (const x of arr) {
    if (typeof x === "string" && VALID_DOMAINS.has(x)) out.add(x);
  }
  return out;
}

function loadLegacyDomains(): Set<string> | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LEGACY_DOMAINS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    const out = parseDomainIds(arr);
    return out;
  } catch {
    return null;
  }
}

function parseMode(raw: unknown): MapDisplayMode {
  if (raw === "heat" || raw === "points" || raw === "both") return raw;
  return "points";
}

function parsePins(raw: unknown): PinnedMapInspector[] {
  if (!Array.isArray(raw)) return [];
  const out: PinnedMapInspector[] = [];
  for (const row of raw) {
    if (
      row !== null &&
      typeof row === "object" &&
      "eventId" in row &&
      typeof (row as { eventId: unknown }).eventId === "string" &&
      "x" in row &&
      typeof (row as { x: unknown }).x === "number" &&
      "y" in row &&
      typeof (row as { y: unknown }).y === "number" &&
      Number.isFinite((row as { x: number }).x) &&
      Number.isFinite((row as { y: number }).y)
    ) {
      out.push({
        eventId: (row as { eventId: string }).eventId,
        x: (row as { x: number }).x,
        y: (row as { y: number }).y,
      });
    }
  }
  return out;
}

export function defaultMapViewState(): MapViewPersistState {
  const now = Date.now();
  return {
    domains: defaultMapDomainSet(),
    mode: "points",
    showTerminator: false,
    showSubsun: false,
    showMoon: false,
    showCausal: false,
    showPhotorealEarth: false,
    showDemoLayers: false,
    showWeatherOverlays: false,
    showPublicTracking: false,
    simDayStart: utcDayStartMs(now),
    simMinOfDay: currentSimMinOfDay(),
    pins: [],
  };
}

export function loadMapViewState(): MapViewPersistState {
  const base = defaultMapViewState();
  if (typeof sessionStorage === "undefined") {
    return base;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = loadLegacyDomains();
      if (legacy) {
        base.domains = legacy;
      }
      return base;
    }
    const data = JSON.parse(raw) as Partial<PersistedJson>;
    if (data.v !== 1) return base;
    return {
      domains: parseDomainIds(data.domains),
      mode: parseMode(data.mode),
      showTerminator: data.showTerminator === true,
      showSubsun: data.showSubsun === true,
      showMoon: data.showMoon === true,
      showCausal: data.showCausal === true,
      showPhotorealEarth: data.showPhotorealEarth === true,
      showDemoLayers: data.showDemoLayers === true,
      showWeatherOverlays: data.showWeatherOverlays === true,
      showPublicTracking: data.showPublicTracking === true,
      simDayStart:
        typeof data.simDayStart === "number" && Number.isFinite(data.simDayStart)
          ? data.simDayStart
          : base.simDayStart,
      simMinOfDay:
        typeof data.simMinOfDay === "number" &&
        data.simMinOfDay >= 0 &&
        data.simMinOfDay < 24 * 60
          ? Math.floor(data.simMinOfDay)
          : base.simMinOfDay,
      pins: parsePins(data.pins),
    };
  } catch {
    const legacy = loadLegacyDomains();
    if (legacy) base.domains = legacy;
    return base;
  }
}

export function saveMapViewState(state: MapViewPersistState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: PersistedJson = {
      v: 1,
      domains: [...state.domains],
      mode: state.mode,
      showTerminator: state.showTerminator,
      showSubsun: state.showSubsun,
      showMoon: state.showMoon,
      showCausal: state.showCausal,
      showPhotorealEarth: state.showPhotorealEarth,
      showDemoLayers: state.showDemoLayers,
      showWeatherOverlays: state.showWeatherOverlays,
      showPublicTracking: state.showPublicTracking,
      simDayStart: state.simDayStart,
      simMinOfDay: state.simMinOfDay,
      pins: state.pins.map((p) => ({
        eventId: p.eventId,
        x: p.x,
        y: p.y,
      })),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.setItem(LEGACY_DOMAINS_KEY, JSON.stringify(payload.domains));
  } catch {
    /* quota / private mode */
  }
}

/** @deprecated */
export function loadMapDomainSet(): Set<string> {
  return loadMapViewState().domains;
}

/** @deprecated */
export function saveMapDomainSet(s: ReadonlySet<string>): void {
  const current = loadMapViewState();
  current.domains = new Set(s);
  saveMapViewState(current);
}
