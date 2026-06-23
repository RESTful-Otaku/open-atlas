export function globeLayerFingerprint(parts: {
  revision: number;
  simUtcMs: number;
  mode: string;
  mapDomains: string;
  showCausal: boolean;
  showTerminator: boolean;
  showSubsun: boolean;
  showMoon: boolean;
  showWeather: boolean;
  showTrackingPaths: boolean;
  trackingCount: number;
  geoCount: number;
  causalCount: number;
}): string {
  return [
    parts.revision,
    parts.simUtcMs,
    parts.mode,
    parts.mapDomains,
    parts.showCausal ? 1 : 0,
    parts.showTerminator ? 1 : 0,
    parts.showSubsun ? 1 : 0,
    parts.showMoon ? 1 : 0,
    parts.showWeather ? 1 : 0,
    parts.showTrackingPaths ? 1 : 0,
    parts.trackingCount,
    parts.geoCount,
    parts.causalCount,
  ].join("|");
}
